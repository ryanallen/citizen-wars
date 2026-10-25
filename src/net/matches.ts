// Playfields (ticket, Decisions: what is a system's star): the clock is cut into
// spans of MATCH_MS, and a game takes one of the DOS game's four playfields from
// the system's name and the span its host began in, keeping it while it lasts.
// Games no longer end on the clock (owner, 25 October 2026); the spans only deal.
// Each system deals the four in a shuffled order, every one once before any comes
// back, never the same twice in a row, and each system's order is its own, so
// neighbours differ.

import { hash } from './config';

export const MATCH_MS = 3 * 60 * 1000;

export interface Playfield { planet: boolean; gravity: boolean }

/** The DOS menu's PLANET and GRAVITY, every way they go together. */
export const PLAYFIELDS: Playfield[] = [
  { planet: true, gravity: true },
  { planet: true, gravity: false },
  { planet: false, gravity: true },
  { planet: false, gravity: false },
];

export function matchAt(now: number): number {
  return Math.floor(now / MATCH_MS);
}

export function msLeft(now: number): number {
  return MATCH_MS - (now % MATCH_MS);
}

/** One shuffle of the four for the system's nth deal, by its own seed. */
function deal(system: string, n: number): number[] {
  const order = PLAYFIELDS.map((_, k) => k);
  let h = hash(`${system}#${n}`);
  for (let k = order.length - 1; k > 0; k--) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    const j = h % (k + 1);
    [order[k], order[j]] = [order[j], order[k]];
  }
  return order;
}

/** The playfield of a system's match: a fresh deal every four, its first never the last one's end. */
export function playfieldFor(system: string, match: number): Playfield {
  const n = Math.floor(match / PLAYFIELDS.length);
  const order = deal(system, n);
  // Swapping the first two never moves the last, so the last deal's end is read raw.
  if (order[0] === deal(system, n - 1)[PLAYFIELDS.length - 1]) [order[0], order[1]] = [order[1], order[0]];
  return PLAYFIELDS[order[((match % PLAYFIELDS.length) + PLAYFIELDS.length) % PLAYFIELDS.length]];
}
