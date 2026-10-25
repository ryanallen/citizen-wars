// Being in a system with no typing (ticket, Is it doable; How it is built;
// Phase 3): read every live note, join the nearest system with room or host
// the nearest unclaimed one, retry for ever, and hand the system over.

import { Game } from './sim/game';
import { NO_INPUT, type Input } from './sim/input';
import { Identity, Pool } from './net/nostr';
import { CAP, retryWait, type RelayList } from './net/config';
import { readNotes, type Note } from './net/lobby';
import { Host, Client, type Outcome } from './net/session';
import type { Member } from './net/wire';
import { SYSTEMS, rank, systemById } from './systems';
import { gameFor } from './sim/snapshot';
import { countKills } from './net/tally';

/** How often to count again, so kills anywhere show soon. */
const COUNT_EVERY_MS = 30000;

export type Phase =
  | { kind: 'connecting'; attempt: number; system: string | null }
  | { kind: 'host'; host: Host }
  | { kind: 'client'; client: Client };

export interface Target { system: string; note: Note | null }

export interface OnlineOptions {
  relays: RelayList;
  callsign: string;
  /** The system named in the address, if any. */
  wanted?: string | null;
  me?: Identity;
  /** Called with the system once in it, to write it into the address. */
  onSystem?: (system: string) => void;
  /** Tests: refuse direct offers from these keys, so they must go through another player. */
  refuseDirect?: (pubkey: string) => boolean;
  wait?: (ms: number) => Promise<void>;
}

export class Online {
  readonly me: Identity;
  phase: Phase = { kind: 'connecting', attempt: 0, system: null };
  /** A local game against a robot, flown while connecting. */
  readonly practice = new Game((Date.now() >>> 0) ^ 0x5eed);
  log: string[] = [];
  /** Kills in games a person is in, site-wide; null until the relays answer. */
  kills: number | null = null;
  private counting = false;
  private countTimer: ReturnType<typeof setTimeout> | null = null;
  private notes: Pool;
  private failures = new Map<string, number>();
  private wanted: string | null;
  private running = false;
  private stopped = false;
  private hidden = false;

  constructor(private o: OnlineOptions) {
    this.me = o.me ?? Identity.random();
    this.wanted = o.wanted ?? null;
    this.notes = new Pool(o.relays.notes);
    this.practice.options = { planet: true, gravity: false, robot: [false, true] };
    this.practice.startRound();
  }

  get callsign(): string { return this.o.callsign; }
  set callsign(c: string) { this.o.callsign = c; }

  private note(s: string): void {
    this.log.push(`${new Date().toISOString().slice(11, 19)} ${s}`);
    if (this.log.length > 50) this.log.shift();
  }

  private wait(ms: number): Promise<void> {
    return this.o.wait ? this.o.wait(ms) : new Promise((r) => setTimeout(r, ms));
  }

  /** The game to draw and play now, and which side is this player's. */
  view(): { game: Game; side: number; roster: Member[] } {
    const p = this.phase;
    if (p.kind === 'host') return { game: p.host.game, side: p.host.side, roster: p.host.roster() };
    if (p.kind === 'client' && p.client.side >= 0) return { game: p.client.game, side: p.client.side, roster: p.client.roster };
    return { game: this.practice, side: 0, roster: [] };
  }

  get system(): string | null {
    const p = this.phase;
    return p.kind === 'host' ? p.host.system : p.kind === 'client' ? p.client.system : p.system;
  }

  tick(local: Input): void {
    const p = this.phase;
    if (p.kind === 'host') p.host.tick(local);
    else if (p.kind === 'client') p.client.tick(local);
    else {
      this.practice.inputs[0] = local;
      if (this.practice.step() === 'round-over') this.practice.startRound();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
    if (!this.counting) { this.counting = true; void this.count(); }
  }

  /** Count the kills now, then every COUNT_EVERY_MS. */
  private async count(): Promise<void> {
    const n = await countKills(this.notes);
    if (n !== null && n >= (this.kills ?? 0)) this.kills = n;
    if (!this.stopped) this.countTimer = setTimeout(() => void this.count(), COUNT_EVERY_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.countTimer) clearTimeout(this.countTimer);
    this.leave();
    this.notes.disconnect();
  }

  private leave(): void {
    const p = this.phase;
    if (p.kind === 'host') p.host.stop();
    if (p.kind === 'client') p.client.close();
  }

  /** The tab hid: a host hands over at once, since a hidden tab's timers slow to a crawl. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const p = this.phase;
    if (hidden && p.kind === 'host' && p.host.members.size) {
      const to = p.host.handover();
      this.note(`hidden: handed ${p.host.system} to ${to?.slice(0, 8)}`);
      this.wanted = p.host.system;
      this.phase = { kind: 'connecting', attempt: 0, system: p.host.system };
    }
    if (!hidden && this.phase.kind === 'connecting' && !this.running) this.start();
  }

  /** Choose where to go: the address's system if it has room, else the nearest with room, else host the nearest free one. */
  protected async choose(skip: Set<string>): Promise<Target[]> {
    await this.notes.connect();
    const notes = (await readNotes(this.notes)).filter((n) => n.host !== this.me.pubkey);
    const bySystem = new Map<string, Note>();
    for (const n of notes) {
      const old = bySystem.get(n.system);
      // Two hosts on one system: the lower key keeps it.
      if (!old || n.host < old.host) bySystem.set(n.system, n);
    }
    const open = [...bySystem.values()].filter((n) => n.players < Math.min(n.cap || CAP, CAP) && !skip.has(n.system))
      .sort((a, b) => rank(a.system) - rank(b.system));
    if (this.wanted) {
      const w = bySystem.get(this.wanted);
      const want = this.wanted;
      this.wanted = null;
      if (w && open.includes(w)) return [{ system: want, note: w }, ...open.filter((n) => n !== w).map((n) => ({ system: n.system, note: n }))];
      this.note(`${want}: ${w ? 'full' : 'empty'}, joining as usual`);
    }
    if (open.length) return open.map((n) => ({ system: n.system, note: n }));
    const free = SYSTEMS.find((s) => !bySystem.has(s.id));
    return [{ system: free ? free.id : `${SYSTEMS[SYSTEMS.length - 1].id}-${Date.now() % 1000}`, note: null }];
  }

  private async loop(): Promise<void> {
    let attempt = 0;
    while (!this.stopped) {
      if (this.hidden) { this.running = false; return; }
      attempt++;
      const targets = await this.choose(new Set());
      const first = targets[0];
      this.phase = { kind: 'connecting', attempt, system: first.system };
      if (!first.note) {
        if (await this.hostSystem(first.system)) { attempt = 0; return void (this.running = false); }
        // No relays answered: offline, so wait and try again.
        this.note(`attempt ${attempt}: no relays`);
        await this.wait(retryWait(attempt - 1));
        continue;
      }
      // After three failures on one system, try the next open one alongside it.
      const tries = [first];
      if ((this.failures.get(first.system) ?? 0) >= 3 && targets[1]?.note) tries.push(targets[1]);
      const outcome = await this.race(tries, attempt);
      if (outcome === 'joined') { attempt = 0; return void (this.running = false); }
      if (outcome === 'full') continue;
      this.failures.set(first.system, (this.failures.get(first.system) ?? 0) + 1);
      await this.wait(retryWait(attempt - 1));
    }
  }

  /** Try each target: direct first, then through another player, then through the next relays. */
  private async race(targets: Target[], attempt: number): Promise<Outcome> {
    const attempts = targets.map((t) => this.tryJoin(t, attempt));
    const results = await new Promise<{ outcome: Outcome; client: Client | null }[]>((resolve) => {
      const done: { outcome: Outcome; client: Client | null }[] = [];
      attempts.forEach((a) => a.then((r) => {
        done.push(r);
        if (r.outcome === 'joined' || done.length === attempts.length) resolve(done);
      }));
    });
    const won = results.find((r) => r.outcome === 'joined' && r.client);
    // Close any slower one that also got in.
    void Promise.all(attempts).then((all) => all.forEach((r) => { if (r.client && r.client !== won?.client) r.client.close(); }));
    if (won?.client) {
      this.becomeClient(won.client);
      return 'joined';
    }
    return results.some((r) => r.outcome === 'full') ? 'full' : 'failed';
  }

  protected async tryJoin(t: Target, attempt: number): Promise<{ outcome: Outcome; client: Client | null }> {
    const note = t.note!;
    const routes: { via?: string; shift: number }[] = [{ shift: 0 }];
    for (const m of note.members) if (m !== note.host && m !== this.me.pubkey) routes.push({ via: m, shift: 0 });
    routes.push({ shift: 1 });
    const route = routes[(attempt - 1) % routes.length];
    this.note(`attempt ${attempt}: ${t.system} ${route.via ? `through ${route.via.slice(0, 8)}` : `direct, relays ${route.shift}`}`);
    const client = new Client({ system: t.system, me: this.me, relays: this.o.relays, callsign: this.o.callsign, host: note.host, shift: route.shift, via: route.via });
    const outcome = await client.connect();
    if (outcome !== 'joined') client.close();
    this.note(`attempt ${attempt}: ${outcome}`);
    return { outcome, client: outcome === 'joined' ? client : null };
  }

  protected becomeClient(client: Client): void {
    this.phase = { kind: 'client', client };
    this.failures.delete(client.system);
    this.o.onSystem?.(client.system);
    this.note(`in ${client.system} as side ${client.side}`);
    client.onEnd = (why, handover) => {
      const system = client.system;
      const roster = client.roster.filter((m) => m.pubkey !== client.host);
      if (why === 'handover' && handover?.to === this.me.pubkey) {
        this.note(`${system} handed to me`);
        void this.hostSystem(system, gameFor(handover.world), client.side);
        return;
      }
      this.phase = { kind: 'connecting', attempt: 0, system };
      const next = roster.sort((a, b) => a.joined - b.joined)[0];
      const rejoin = () => {
        this.note(`${system}: ${why}, rejoining`);
        this.wanted = system;
        this.running = false;
        this.start();
      };
      if (why !== 'lost' || next?.pubkey !== this.me.pubkey) return rejoin();
      // The host went without a word, and this player is next-oldest: carry on
      // from the last world, but only once the host's note has gone, since a
      // live note means it was this player who dropped.
      void this.hostGone(system, client.host).then((gone) => {
        if (!gone) return rejoin();
        this.note(`${system}: host lost, carrying on as host`);
        void this.hostSystem(system, client.game, client.side).then((ok) => { if (!ok) rejoin(); });
      });
    };
  }

  /** True when the relays answer and the host's note has not been rewritten for longer than its life. */
  private async hostGone(system: string, host: string): Promise<boolean> {
    for (let n = 0; n < 4; n++) {
      if (!(await this.notes.connect()).length) return false;
      const notes = await readNotes(this.notes, 2500);
      const live = notes.find((x) => x.system === system && x.host === host);
      if (!live) return true;
      await this.wait(3000);
    }
    return false;
  }

  private async hostSystem(system: string, game?: Game, side = 0): Promise<boolean> {
    const stars = systemById(system)?.stars;
    const host = new Host({ system, me: this.me, relays: this.o.relays, callsign: this.o.callsign, game, side, stars, refuseDirect: this.o.refuseDirect });
    try {
      await host.start();
    } catch {
      host.stop();
      return false;
    }
    this.phase = { kind: 'host', host };
    this.o.onSystem?.(system);
    this.note(`hosting ${system}`);
    host.onYield = (winner) => {
      this.note(`${system}: ${winner.slice(0, 8)} keeps it, joining them`);
      host.stop();
      this.wanted = system;
      this.phase = { kind: 'connecting', attempt: 0, system };
      this.running = false;
      this.start();
    };
    return true;
  }
}

export { NO_INPUT };
