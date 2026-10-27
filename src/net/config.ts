// Network settings (ticket, Is it doable and Phase 3).

/** System notes: NIP-78 application data, which relays store and keep only the newest of. */
export const KIND_NOTE = 30078;
/** Handshake messages: an ephemeral kind, passed on and never stored. */
export const KIND_SIGNAL = 25050;
/** Kept from the game's first name: every tab still open and every note on the relays uses it. */
export const TAG = 'citizen-wars';
/** A note expires ten seconds out and is rewritten every five. */
export const NOTE_LIFE_S = 10;
export const NOTE_EVERY_MS = 5000;
/** Worlds sent to clients a second. */
export const WORLDS_PER_SECOND = 30;
/** Players a system holds, set by the load tests (ticket, Decisions). */
export const CAP = 12;
/** Free public STUN servers, which tell each browser its own public address. */
export const STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478', 'stun:global.stun.twilio.com:3478'];
/** Retry waits: 1, 2, 4, 8, then every 15 seconds, never giving up. */
export const RETRY_MS = [1000, 2000, 4000, 8000, 15000];
export const retryWait = (attempt: number): number => RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];

export interface RelayList { notes: string[]; all: string[] }

export async function loadRelays(base = import.meta.env?.BASE_URL ?? '/'): Promise<RelayList> {
  const r = await fetch(`${base}relays.json`, { cache: 'no-cache' });
  const j = await r.json();
  return { notes: j.notes, all: j.all };
}

/** A small, stable hash of a name, to spread systems over relays. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The relays a system's handshakes go through: three picked by its name, shifted by the attempt. */
export function handshakeRelays(list: RelayList, system: string, shift = 0, count = 3): string[] {
  const start = (hash(system) + shift * count) % list.all.length;
  return Array.from({ length: Math.min(count, list.all.length) }, (_, k) => list.all[(start + k) % list.all.length]);
}
