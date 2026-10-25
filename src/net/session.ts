// The host and the client (ticket, Phase 3; Decisions: how a client draws a
// world the host corrects).

import { Game, fieldSize, MAX_SHIPS } from '../sim/game';
import { NO_INPUT, type Input } from '../sim/input';
import { saveWorld, loadWorld, worldShips } from '../sim/snapshot';
import { Identity, Pool } from './nostr';
import { Peer, type Channel } from './peer';
import { CAP, NOTE_EVERY_MS, WORLDS_PER_SECOND, handshakeRelays, type RelayList } from './config';
import { Signals, noteEvent, watchNotes, keeps, type Signal } from './lobby';
import { matchAt, playfieldFor } from './matches';
import { encodeInput, decodeInput, encodeWorld, decodeWorld, b64, unb64, type Control, type Member } from './wire';

const TICK_HZ = 1193182 / 16390;

interface Remote {
  pubkey: string;
  callsign: string;
  side: number;
  joined: number;
  input: Input;
  ack: number;
  /** The direct connection, or the member that passes this one's traffic. */
  peer: Peer | null;
  via: string | null;
}

const asBytes = (d: ArrayBuffer | string): Uint8Array | null => (typeof d === 'string' ? null : new Uint8Array(d));
const asControl = (d: ArrayBuffer | string): Control | null => {
  if (typeof d !== 'string') return null;
  try { return JSON.parse(d) as Control; } catch { return null; }
};

export interface HostOptions {
  system: string;
  me: Identity;
  relays: RelayList;
  callsign: string;
  side?: number;
  game?: Game;
  joined?: number;
  seed?: number;
  /** Refuse direct offers (tests of passing traffic through another player). */
  refuseDirect?: (pubkey: string) => boolean;
  /** The system's stars, mass and radius in Suns. */
  stars?: { mass: number; radius: number }[];
  /** The wall clock the matches run on; tests set it. */
  now?: () => number;
}

export class Host {
  readonly game: Game;
  readonly side: number;
  readonly members = new Map<string, Remote>();
  readonly joined: number;
  hostTick = 0;
  /** Bytes sent to members and worlds sent, for the load tests (Phase 4). */
  sentBytes = 0;
  worldsOut = 0;
  onRoster: (roster: Member[]) => void = () => {};
  /** Another host keeps this system: this one should join it instead. */
  onYield: (winner: string) => void = () => {};
  private notes: Pool;
  private signalPool: Pool;
  private signals: Signals;
  private stops: (() => void)[] = [];
  private noteTimer: ReturnType<typeof setInterval> | null = null;
  private admitting: Promise<void> = Promise.resolve();
  private worldsSent = 0;
  private stopped = false;
  /** The match this host is running; a host taking over keeps the one it was handed. */
  private match: number;

  constructor(private o: HostOptions) {
    this.side = o.side ?? 0;
    this.joined = o.joined ?? Date.now();
    this.game = o.game ?? new Game(o.seed ?? (Date.now() >>> 0), undefined, MAX_SHIPS);
    this.match = matchAt(this.now());
    if (!o.game) {
      // Online the star is the system's, shown and pulling as this match's playfield deals (matches.ts).
      const g = this.game;
      g.rules = 'respawn';
      Object.assign(g.options, playfieldFor(o.system, this.match));
      g.present[this.side] = true;
      g.setStars(o.stars ?? [{ mass: 1, radius: 1 }]);
      g.startRound();
    }
    this.game.listener = this.side;
    this.presence();
    this.notes = new Pool(o.relays.notes);
    this.signalPool = new Pool(handshakeRelays(o.relays, o.system));
    this.signals = new Signals(this.signalPool, o.me);
  }

  private now(): number { return (this.o.now ?? Date.now)(); }

  /** A new match: the next playfield, scores back to nothing, every ship at its start. */
  private newMatch(match: number): void {
    const g = this.game;
    this.match = match;
    Object.assign(g.options, playfieldFor(this.o.system, match));
    g.kills.fill(0);
    g.deaths.fill(0);
    g.startRound();
  }

  get pubkey(): string { return this.o.me.pubkey; }
  get system(): string { return this.o.system; }

  async start(): Promise<void> {
    const [notes, signals] = await Promise.all([this.notes.connect(), this.signalPool.connect()]);
    if (!notes.length || !signals.length) {
      this.stop();
      throw new Error('no relays');
    }
    this.stops.push(this.signals.listen((from, s) => this.signal(from, s)));
    await this.publishNote();
    this.noteTimer = setInterval(() => void this.publishNote(), NOTE_EVERY_MS);
    this.stops.push(watchNotes(this.notes, this.o.system, (n) => {
      if (n.host === this.pubkey || this.members.size) return;
      if (keeps(n.host, this.pubkey) === n.host) this.onYield(n.host);
    }));
  }

  roster(): Member[] {
    const me = { pubkey: this.pubkey, callsign: this.o.callsign, side: this.side, joined: this.joined };
    return [me, ...[...this.members.values()].map((m) => ({ pubkey: m.pubkey, callsign: m.callsign, side: m.side, joined: m.joined }))]
      .sort((a, b) => a.joined - b.joined);
  }

  /** Rewrite the note, reopening any relay that dropped (and with it the handshake subscriptions). */
  private async publishNote(): Promise<number> {
    if (this.stopped) return 0;
    await Promise.all([this.notes.connect(), this.signalPool.connect()]);
    const members = this.roster().map((m) => m.pubkey);
    return this.notes.publish(await noteEvent(this.o.me, { system: this.o.system, players: members.length, cap: CAP, members }));
  }

  private signal(from: string, s: Signal): void {
    if (s.type !== 'offer' || s.system !== this.o.system) return;
    if (this.o.refuseDirect?.(from)) return;
    // One at a time, so the last place cannot be taken twice.
    this.admitting = this.admitting.then(() => this.admit(from, s)).catch(() => {});
  }

  private freeSide(): number {
    const taken = new Set([this.side, ...[...this.members.values()].map((m) => m.side)]);
    for (let s = 0; s < CAP; s++) if (!taken.has(s)) return s;
    return -1;
  }

  private async admit(from: string, s: Extract<Signal, { type: 'offer' }>): Promise<void> {
    if (this.members.has(from)) this.remove(from);
    if (this.freeSide() < 0) {
      await this.signals.send(from, { type: 'full', session: s.session });
      return;
    }
    const peer = new Peer();
    const sdp = await peer.answer(s.sdp);
    await this.signals.send(from, { type: 'answer', session: s.session, sdp });
    if (!(await peer.opens(12000))) { peer.close(); return; }
    const side = this.freeSide();
    if (side < 0) { peer.send('reliable', JSON.stringify({ t: 'full' } satisfies Control)); peer.close(); return; }
    this.add({ pubkey: from, callsign: s.callsign, side, joined: Date.now(), input: NO_INPUT, ack: 0, peer, via: null });
  }

  private add(m: Remote): void {
    this.members.set(m.pubkey, m);
    if (m.peer) {
      m.peer.onMessage = (ch, d) => this.message(m.pubkey, ch, d);
      m.peer.onClose = () => this.remove(m.pubkey);
    }
    this.sendTo(m.pubkey, JSON.stringify({ t: 'welcome', side: m.side, roster: this.roster() } satisfies Control));
    this.rosterChanged();
  }

  remove(pubkey: string): void {
    const m = this.members.get(pubkey);
    if (!m) return;
    this.members.delete(pubkey);
    m.peer?.close();
    for (const r of [...this.members.values()]) if (r.via === pubkey) this.remove(r.pubkey);
    this.rosterChanged();
  }

  /**
   * Ships in play: this player's and each member's, and a robot stand-in only
   * when this player is alone (Phase 2); the field sized for the ships present.
   */
  private presence(): void {
    const g = this.game;
    const occupied = new Set([this.side, ...[...this.members.values()].map((m) => m.side)]);
    let robot = -1;
    if (occupied.size === 1) for (let s = 0; s < g.ships && robot < 0; s++) if (!occupied.has(s)) robot = s;
    const want = (s: number) => occupied.has(s) || s === robot;
    const count = Array.from({ length: g.ships }, (_, s) => s).filter(want).length;
    const { w, h } = fieldSize(Math.max(2, count));
    g.setField(w, h);
    for (let s = 0; s < g.ships; s++) {
      g.options.robot[s] = s === robot;
      if (want(s) && !g.present[s]) g.arrive(s);
      else if (!want(s) && g.present[s]) g.leave(s);
    }
  }

  private rosterChanged(): void {
    this.presence();
    const roster = this.roster();
    for (const m of this.members.values()) this.sendTo(m.pubkey, JSON.stringify({ t: 'roster', roster } satisfies Control));
    this.onRoster(roster);
    void this.publishNote();
  }

  /** Send to a member, directly or through the member that passes its traffic. */
  private sendTo(pubkey: string, data: Uint8Array | string, ch: Channel = typeof data === 'string' ? 'reliable' : 'fast'): void {
    const m = this.members.get(pubkey);
    if (!m) return;
    this.sentBytes += typeof data === 'string' ? data.length : data.length;
    if (m.peer) { m.peer.send(ch, data); return; }
    const via = m.via ? this.members.get(m.via) : undefined;
    if (!via?.peer) return;
    const payload = typeof data === 'string' ? btoa(unescape(encodeURIComponent(data))) : b64(data);
    via.peer.send('reliable', JSON.stringify({ t: 'relayed', from: pubkey, data: (typeof data === 'string' ? 's' : 'b') + payload } satisfies Control));
  }

  private message(from: string, ch: Channel, d: ArrayBuffer | string): void {
    const m = this.members.get(from);
    if (!m) return;
    const bytes = asBytes(d);
    if (bytes) {
      const got = decodeInput(bytes);
      if (got && got.seq > m.ack) { m.input = got.input; m.ack = got.seq; }
      return;
    }
    const c = asControl(d);
    if (!c) return;
    if (c.t === 'hello') { m.callsign = c.callsign.slice(0, 12); this.rosterChanged(); }
    else if (c.t === 'ping') this.sendTo(from, JSON.stringify({ t: 'pong', at: c.at } satisfies Control));
    else if (c.t === 'bye') this.remove(from);
    else if (c.t === 'relay-for' && ch === 'reliable') {
      if (this.freeSide() < 0) return;
      const side = this.freeSide();
      this.add({ pubkey: c.pubkey, callsign: c.callsign, side, joined: Date.now(), input: NO_INPUT, ack: 0, peer: null, via: from });
    } else if (c.t === 'relayed') {
      const inner = c.data.slice(1);
      if (c.data[0] === 'b') this.message(c.from, 'fast', unb64(inner).buffer as ArrayBuffer);
      else this.message(c.from, 'reliable', decodeURIComponent(escape(atob(inner))));
    }
  }

  /** One tick: this player's input and each member's latest. */
  tick(local: Input): void {
    const g = this.game;
    g.inputs[this.side] = local;
    for (const m of this.members.values()) g.inputs[m.side] = m.input;
    const match = matchAt(this.now());
    if (match !== this.match) this.newMatch(match);
    if (g.step() === 'round-over') {
      g.startRound();
    }
    this.hostTick++;
    const due = Math.floor((this.hostTick * WORLDS_PER_SECOND) / TICK_HZ);
    if (due > this.worldsSent) {
      this.worldsSent = due;
      if (this.members.size) this.worldsOut++;
      this.broadcast();
    }
  }

  private broadcast(): void {
    if (!this.members.size) return;
    const world = saveWorld(this.game);
    const inputs = this.game.inputs;
    for (const m of this.members.values()) this.sendTo(m.pubkey, encodeWorld(this.hostTick, m.ack, inputs, world), 'fast');
  }

  /** Leave, handing the system to the next-oldest player with the world as it stands. */
  handover(): string | null {
    const next = this.roster().find((m) => m.pubkey !== this.pubkey);
    if (next) {
      const msg: Control = { t: 'handover', to: next.pubkey, tick: this.hostTick, world: b64(saveWorld(this.game)) };
      for (const m of this.members.values()) this.sendTo(m.pubkey, JSON.stringify(msg));
    }
    setTimeout(() => this.stop(), 300);
    return next?.pubkey ?? null;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.noteTimer) clearInterval(this.noteTimer);
    this.stops.forEach((f) => f());
    for (const m of this.members.values()) m.peer?.close();
    this.members.clear();
    this.notes.disconnect();
    this.signalPool.disconnect();
  }
}

export interface ClientOptions {
  system: string;
  me: Identity;
  relays: RelayList;
  callsign: string;
  host: string;
  /** Which handshake relays to use: 0 first, then the next ones in the list on later attempts. */
  shift?: number;
  /** Connect through this member instead of to the host directly. */
  via?: string;
}

export type Outcome = 'joined' | 'full' | 'failed';

export class Client {
  /** This player's copy of the host's game, made to the host's size by the first world. */
  game = new Game(1);
  side = -1;
  roster: Member[] = [];
  rttMs = 0;
  lastWorldAt = 0;
  worldsIn = 0;
  /** The host left: 'handover' with the world when it passed the system on, else 'lost'. */
  onEnd: (why: 'lost' | 'handover', handover?: { to: string; world: Uint8Array }) => void = () => {};
  private peer: Peer | null = null;
  private pool: Pool;
  private signals: Signals;
  seq = 0;
  private history = new Map<number, Input>();
  private others: Input[] = [];
  private stops: (() => void)[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private ended = false;
  /** Members this one passes traffic for: their key to their connection. */
  private children = new Map<string, Peer>();

  constructor(private o: ClientOptions) {
    this.pool = new Pool(handshakeRelays(o.relays, o.system, o.shift ?? 0));
    this.signals = new Signals(this.pool, o.me);
  }

  get host(): string { return this.o.host; }
  get system(): string { return this.o.system; }

  async connect(timeoutMs = 15000): Promise<Outcome> {
    const open = await this.pool.connect();
    if (!open.length) return 'failed';
    const session = Math.random().toString(36).slice(2);
    const peer = new Peer();
    this.peer = peer;
    const reply = new Promise<Signal | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.stops.push(this.signals.listen((from, s) => {
        if ('session' in s && s.session === session && (from === this.o.host || from === this.o.via)) {
          clearTimeout(timer);
          resolve(s);
        } else if (s.type === 'offer') {
          void this.passFor(from, s);
        }
      }));
    });
    // Let the subscription settle before the host can answer.
    await new Promise((r) => setTimeout(r, 300));
    const sdp = await peer.offer();
    const to = this.o.via ?? this.o.host;
    const sent = await this.signals.send(to, { type: 'offer', system: this.o.system, session, sdp, callsign: this.o.callsign, relay: this.o.via ? this.o.host : undefined });
    if (!sent) { peer.close(); return 'failed'; }
    const s = await reply;
    if (!s || s.type === 'busy') { peer.close(); return 'failed'; }
    if (s.type === 'full') { peer.close(); return 'full'; }
    if (s.type !== 'answer') { peer.close(); return 'failed'; }
    await peer.accept(s.sdp);
    const welcomed = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      peer.onMessage = (ch, d) => {
        const c = asControl(d);
        if (c?.t === 'welcome') { clearTimeout(timer); this.side = c.side; this.roster = c.roster; resolve(true); }
        else if (c?.t === 'full') { clearTimeout(timer); resolve(false); }
        this.message(ch, d);
      };
    });
    if (!(await peer.opens(timeoutMs))) { peer.close(); return 'failed'; }
    peer.send('reliable', JSON.stringify({ t: 'hello', callsign: this.o.callsign, pubkey: this.o.me.pubkey } satisfies Control));
    if (!(await welcomed)) { peer.close(); return 'full'; }
    peer.onClose = () => this.end('lost');
    this.lastWorldAt = performance.now();
    this.pingTimer = setInterval(() => peer.send('reliable', JSON.stringify({ t: 'ping', at: performance.now() } satisfies Control)), 2000);
    return 'joined';
  }

  private message(_ch: Channel, d: ArrayBuffer | string): void {
    const bytes = asBytes(d);
    if (bytes) {
      const w = decodeWorld(bytes);
      if (w) this.world(w.ack, w.inputs, w.world);
      return;
    }
    const c = asControl(d);
    if (!c) return;
    if (c.t === 'roster') this.roster = c.roster;
    else if (c.t === 'pong') this.rttMs = performance.now() - c.at;
    else if (c.t === 'handover') this.end('handover', { to: c.to, world: unb64(c.world) });
    else if (c.t === 'relayed') {
      // From the host, for a member this one passes traffic for.
      const child = this.children.get(c.from);
      if (!child) return;
      if (c.data[0] === 'b') child.send('fast', unb64(c.data.slice(1)));
      else child.send('reliable', decodeURIComponent(escape(atob(c.data.slice(1)))));
    }
  }

  /** Load the host's world, then re-run this player's inputs the host has not used yet. */
  private world(ack: number, inputs: Input[], bytes: Uint8Array): void {
    this.lastWorldAt = performance.now();
    this.worldsIn++;
    if (worldShips(bytes) !== this.game.ships) this.game = new Game(1, undefined, worldShips(bytes));
    loadWorld(this.game, bytes);
    this.game.listener = this.side;
    this.others = inputs;
    for (const k of [...this.history.keys()]) if (k <= ack) this.history.delete(k);
    for (let n = ack + 1; n <= this.seq; n++) this.step(this.history.get(n) ?? NO_INPUT);
  }

  private step(local: Input): void {
    const g = this.game;
    for (let s = 0; s < g.ships; s++) g.inputs[s] = s === this.side ? local : (this.others[s] ?? NO_INPUT);
    if (this.side < g.ships) g.options.robot[this.side] = false;
    if (g.step() === 'round-over') g.startRound();
  }

  /** One tick: send this player's input and move on at once. */
  tick(local: Input): void {
    if (this.ended || !this.peer) return;
    this.seq++;
    this.history.set(this.seq, local);
    this.peer.send('fast', encodeInput(this.seq, local));
    this.step(local);
    if (performance.now() - this.lastWorldAt > 4000) this.end('lost');
  }

  /** Accept a joiner who cannot reach the host, and pass its traffic both ways. */
  private async passFor(from: string, s: Extract<Signal, { type: 'offer' }>): Promise<void> {
    if (s.relay !== this.o.host || !this.peer?.isOpen) {
      await this.signals.send(from, { type: 'busy', session: s.session });
      return;
    }
    const child = new Peer();
    const sdp = await child.answer(s.sdp);
    await this.signals.send(from, { type: 'answer', session: s.session, sdp });
    if (!(await child.opens(12000))) { child.close(); return; }
    this.children.set(from, child);
    this.peer.send('reliable', JSON.stringify({ t: 'relay-for', pubkey: from, callsign: s.callsign } satisfies Control));
    child.onMessage = (_ch, d) => {
      const payload = typeof d === 'string' ? 's' + btoa(unescape(encodeURIComponent(d))) : 'b' + b64(new Uint8Array(d));
      this.peer?.send('reliable', JSON.stringify({ t: 'relayed', from, data: payload } satisfies Control));
    };
    child.onClose = () => {
      this.children.delete(from);
      this.peer?.send('reliable', JSON.stringify({ t: 'relayed', from, data: 's' + btoa(JSON.stringify({ t: 'bye' })) } satisfies Control));
    };
  }

  private end(why: 'lost' | 'handover', handover?: { to: string; world: Uint8Array }): void {
    if (this.ended) return;
    this.ended = true;
    this.close();
    this.onEnd(why, handover);
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.stops.forEach((f) => f());
    const p = this.peer;
    this.peer = null;
    if (p) { p.onClose = () => {}; p.send('reliable', JSON.stringify({ t: 'bye' } satisfies Control)); setTimeout(() => p.close(), 100); }
    for (const c of this.children.values()) c.close();
    this.pool.disconnect();
  }
}
