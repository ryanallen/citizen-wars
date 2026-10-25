// The DOS game's two robots (original.md, Robots) as functions from what a
// ship sees to an Input, so the game reads a robot exactly as it reads a person.

import { Key, type Input } from './input';
import { TAN } from './tables';
import type { Rng } from './rng';

const bit = (k: Key) => 1 << k;

export interface Body { x: number; y: number; alive: boolean }

/** An enemy ship and its torpedoes, in slot order. */
export interface Enemy { ship: Body; torpedoes: Body[] }

export interface RobotView {
  x: number;
  y: number;
  energy: number;
  shield: number;
  enemies: Enemy[];
}

/** The original's box distance: the larger of |dx| and |dy|. */
const box = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Enemies nearest first, by their ships; the original has only one. */
export function nearest(view: RobotView): Enemy[] {
  return [...view.enemies].sort((a, b) => box(view, a.ship) - box(view, b.ship));
}

/** Aim from (dx, dy) by octant with the tangent table (`02AB:03E8`). */
export function aim(dx: number, dy: number): number {
  let flags = 0;
  if (dx < 0) { dx = -dx; flags |= 1; }
  if (dy < 0) { dy = -dy; flags ^= 2; }
  const index = (v: number) => { for (let n = 31; n >= 0; n--) if (v >= TAN[n]) return n; return 0; };
  let a: number;
  if (dy === dx) a = 0x20;
  else if (dy < dx) a = index(Math.floor((dy * 65536) / dx) >> 1);
  else a = 0x40 - index(Math.floor((dx * 65536) / dy) >> 1);
  let base = 0;
  if (flags & 1) { base = 0x80; a = -a; }
  if (flags & 2) a = -a;
  return (((base + a) % 256) + 256) % 256;
}

/** Shield and energy toward each other, as C or Z would move them. */
function balance(view: RobotView): number {
  if (view.shield === view.energy) return 0;
  return view.shield < view.energy ? bit(Key.Shield) : bit(Key.Weapon);
}

/** The left robot (`02AB:038E`): phasers the first threat inside 96 px. */
export function defensive(view: RobotView, rng: Rng): Input {
  let keys = balance(view);
  if (view.energy === 0) return { keys, aim: -1 };
  let target = -1;
  for (const e of nearest(view)) {
    for (const b of [e.ship, ...e.torpedoes]) {
      if (!b.alive || Math.abs(view.y - b.y) >= 0x60 || Math.abs(view.x - b.x) >= 0x60) continue;
      target = aim(b.x - view.x, b.y - view.y);
      keys |= bit(Key.Phaser);
      break;
    }
    if (target >= 0) break;
  }
  if ((rng.next() & 255) < 0x10) keys |= bit(Key.Impulse);
  if ((rng.next() & 0x3ff) === 0) keys |= bit(Key.Hyper);
  return { keys, aim: target };
}

/** The right robot (`02AB:05E5`): always faces the nearest ship and fires at it. */
export function offensive(view: RobotView, rng: Rng): Input {
  const target = nearest(view)[0]?.ship;
  if (!target) return { keys: balance(view), aim: -1 };
  const dx = target.x - view.x;
  const dy = target.y - view.y;
  const close = Math.abs(dx) < 0x60 && Math.abs(dy) < 0x60;
  const a = aim(dx, dy);
  let keys = balance(view);
  if (view.energy === 0) return { keys, aim: a };
  if ((rng.next() & 255) < 0x10) keys |= bit(Key.Impulse);
  if ((rng.next() & 255) < 8) keys |= close ? bit(Key.Phaser) : bit(Key.Photon);
  if ((rng.next() & 0x3ff) === 0) keys |= bit(Key.Hyper);
  return { keys, aim: a };
}
