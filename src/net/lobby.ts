// Finding each other on the relays (ticket, How it is built: Joining, One
// host per system): each host's note, read in one query, and the handshake
// messages addressed to one player's key.

import { Identity, Pool, expired, now, verify, type NostrEvent } from './nostr';
import { KIND_NOTE, KIND_SIGNAL, NOTE_LIFE_S, TAG } from './config';

export interface Note {
  system: string;
  host: string;
  players: number;
  cap: number;
  members: string[];
  at: number;
}

export function noteEvent(me: Identity, n: Omit<Note, 'at' | 'host'>) {
  return me.sign({
    kind: KIND_NOTE,
    tags: [['d', `${TAG}/${n.system}`], ['t', TAG], ['expiration', String(now() + NOTE_LIFE_S)]],
    content: JSON.stringify({ system: n.system, players: n.players, cap: n.cap, members: n.members, v: 1 }),
  });
}

function parseNote(e: NostrEvent): Note | null {
  try {
    const c = JSON.parse(e.content);
    if (typeof c.system !== 'string') return null;
    return { system: c.system, host: e.pubkey, players: Number(c.players) || 0, cap: Number(c.cap) || 0, members: c.members ?? [], at: e.created_at };
  } catch {
    return null;
  }
}

/** Every live note in one query; a note past its expiry is ignored whatever the relay kept. */
export function readNotes(pool: Pool, waitMs = 3000): Promise<Note[]> {
  return new Promise((resolve) => {
    const found = new Map<string, Note>();
    let stop = () => {};
    const done = () => {
      clearTimeout(timer);
      stop();
      resolve([...found.values()]);
    };
    const timer = setTimeout(done, waitMs);
    stop = pool.subscribe([{ kinds: [KIND_NOTE], '#t': [TAG], since: now() - NOTE_LIFE_S * 3 }], (e) => {
      if (expired(e)) return;
      const n = parseNote(e);
      if (!n) return;
      // Keep the newest note per host and system.
      const key = `${n.system}/${n.host}`;
      const old = found.get(key);
      if (!old || old.at <= n.at) found.set(key, n);
    }, done);
  });
}

/** Watch one system's notes as they come, for a second host claiming it. */
export function watchNotes(pool: Pool, system: string, onNote: (n: Note) => void): () => void {
  return pool.subscribe([{ kinds: [KIND_NOTE], '#d': [`${TAG}/${system}`], since: now() - NOTE_LIFE_S }], (e) => {
    if (expired(e)) return;
    const n = parseNote(e);
    if (n) onNote(n);
  });
}

/** Of two hosts claiming a system, the one whose key sorts lower keeps it. */
export const keeps = (a: string, b: string): string => (a < b ? a : b);

export type Signal =
  | { type: 'offer'; system: string; session: string; sdp: string; callsign: string; relay?: string }
  | { type: 'answer'; session: string; sdp: string }
  | { type: 'full'; session: string }
  | { type: 'busy'; session: string };

/** Handshake messages: short-lived events addressed to one player's key. */
export class Signals {
  private seen = new Set<string>();

  constructor(private pool: Pool, private me: Identity) {}

  listen(onSignal: (from: string, s: Signal) => void): () => void {
    return this.pool.subscribe([{ kinds: [KIND_SIGNAL], '#p': [this.me.pubkey], since: now() - 10 }], async (e) => {
      if (this.seen.has(e.id) || !(await verify(e))) return;
      this.seen.add(e.id);
      try {
        onSignal(e.pubkey, JSON.parse(e.content) as Signal);
      } catch {
        // Not ours.
      }
    });
  }

  async send(to: string, s: Signal): Promise<number> {
    const e = await this.me.sign({ kind: KIND_SIGNAL, tags: [['p', to], ['t', TAG]], content: JSON.stringify(s) });
    return this.pool.publish(e);
  }
}
