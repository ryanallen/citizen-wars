// A whole world in bytes, so the host can send it and a new host can carry on
// from it (ticket, Phase 3). Loading it and running the same Inputs gives the
// same game, tick for tick. Only ships present and slots in use are written, so
// a world of 16 ships with few torpedoes out is well under a kilobyte.

import { Game } from './game';

class Writer {
  private buf = new ArrayBuffer(4096);
  private view = new DataView(this.buf);
  private at = 0;

  private room(n: number): void {
    if (this.at + n <= this.buf.byteLength) return;
    const bigger = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.at + n));
    new Uint8Array(bigger).set(new Uint8Array(this.buf));
    this.buf = bigger;
    this.view = new DataView(bigger);
  }

  u8(v: number): void { this.room(1); this.view.setUint8(this.at, v); this.at += 1; }
  i8(v: number): void { this.room(1); this.view.setInt8(this.at, v); this.at += 1; }
  u16(v: number): void { this.room(2); this.view.setUint16(this.at, v); this.at += 2; }
  i16(v: number): void { this.room(2); this.view.setInt16(this.at, v); this.at += 2; }
  i32(v: number): void { this.room(4); this.view.setInt32(this.at, v); this.at += 4; }
  u32(v: number): void { this.room(4); this.view.setUint32(this.at, v >>> 0); this.at += 4; }
  bytes(): Uint8Array { return new Uint8Array(this.buf, 0, this.at).slice(); }
}

class Reader {
  private view: DataView;
  private at = 0;
  constructor(b: Uint8Array) { this.view = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8(): number { return this.view.getUint8(this.at++); }
  i8(): number { return this.view.getInt8(this.at++); }
  u16(): number { const v = this.view.getUint16(this.at); this.at += 2; return v; }
  i16(): number { const v = this.view.getInt16(this.at); this.at += 2; return v; }
  i32(): number { const v = this.view.getInt32(this.at); this.at += 4; return v; }
  u32(): number { const v = this.view.getUint32(this.at); this.at += 4; return v; }
}

const VERSION = 3;
const RULES = ['original', 'last-standing', 'respawn'] as const;

const bits = (a: boolean[]) => a.reduce((m, v, k) => (v ? m | (1 << k) : m), 0);
const unbits = (m: number, n: number) => Array.from({ length: n }, (_, k) => !!(m & (1 << k)));

/** The number of ships a world was saved with, to make a Game to load it into. */
export const worldShips = (bytes: Uint8Array): number => bytes[1];

export function saveWorld(g: Game): Uint8Array {
  const w = new Writer();
  w.u8(VERSION); w.u8(g.ships); w.u8(RULES.indexOf(g.rules));
  w.u16(g.w); w.u16(g.h);
  w.u8(g.tick); w.u8(g.planetFrame); w.u32(g.starSeed);
  w.u32(g.elapsed); w.u32(g.born);
  w.u8((g.options.planet ? 1 : 0) | (g.options.gravity ? 2 : 0) | (g.paused ? 4 : 0));
  w.u16(bits(g.present)); w.u16(bits(g.options.robot));
  w.u8(g.bodies.length);
  for (const b of g.bodies) { w.i16(b.x); w.i16(b.y); w.u8(b.pull); w.u8(b.box); w.u8(Math.round(b.scale * 16)); }
  for (let s = 0; s < g.ships; s++) {
    w.i16(g.wins[s]); w.i16(g.kills[s]); w.i16(g.deaths[s]);
    if (!g.present[s]) continue;
    w.i8(g.spin[s]); w.u8(g.ctl[s]); w.u8(g.latch[s]); w.i8(g.shield[s]); w.i8(g.phaserTimer[s]);
    w.u8(g.phaserShown[s] ? 1 : 0);
    for (const v of g.phaserFrom[s]) w.i16(v);
    w.u8(g.hyperStep[s]); w.i8(g.lastHit[s]); w.i16(g.exploding[s]);
  }
  // Slots in use: a bitmask, then each one.
  const used: number[] = [];
  for (let i = 0; i < g.slots; i++) if (g.state[i] !== 0 || (!(i & 7) && g.present[i >> 3])) used.push(i);
  const mask = new Uint8Array(g.slots / 8);
  for (const i of used) mask[i >> 3] |= 1 << (i & 7);
  for (const b of mask) w.u8(b);
  for (const i of used) {
    w.i32(g.px[i]); w.i32(g.py[i]); w.i32(g.vx[i]); w.i32(g.vy[i]);
    w.i16(g.oldx[i]); w.i16(g.oldy[i]);
    w.i8(g.state[i]); w.u8(g.angle[i]); w.u8(g.oldangle[i]);
    w.u8((g.redraw[i] ? 1 : 0) | (g.drawn[i] ? 2 : 0));
    w.i8(g.energy[i]); w.u8(g.anim[i]);
  }
  w.u8(g.labels); w.u8(g.soundFlags); w.u8(g.soundCount);
  for (const b of g.rng.state()) w.u8(b);
  // Particles by their seeds only, while something uses them: a hyperspace cloud or an explosion.
  for (let s = 0; s < g.ships; s++) {
    if (g.hyperStep[s]) w.u32(g.hyperSeed[s]);
    if (g.exploding[s] >= 0) w.u32(g.exSeed[s]);
  }
  return w.bytes();
}

/** Load a world into a game made with the same number of ships (`worldShips`). */
export function loadWorld(g: Game, bytes: Uint8Array): void {
  const r = new Reader(bytes);
  if (r.u8() !== VERSION) throw new Error('world version');
  if (r.u8() !== g.ships) throw new Error('world ships');
  g.rules = RULES[r.u8()];
  g.w = r.u16(); g.h = r.u16();
  g.tick = r.u8(); g.planetFrame = r.u8(); g.starSeed = r.u32();
  g.elapsed = r.u32(); g.born = r.u32();
  const f = r.u8();
  // Whether sound is on stays each player's own.
  g.options.planet = !!(f & 1); g.options.gravity = !!(f & 2); g.paused = !!(f & 4);
  g.present = unbits(r.u16(), g.ships);
  g.options.robot = unbits(r.u16(), g.ships);
  const nb = r.u8();
  g.bodies = [];
  for (let n = 0; n < nb; n++) g.bodies.push({ x: r.i16(), y: r.i16(), pull: r.u8(), box: r.u8(), scale: r.u8() / 16 });
  for (let s = 0; s < g.ships; s++) {
    g.wins[s] = r.i16(); g.kills[s] = r.i16(); g.deaths[s] = r.i16();
    if (!g.present[s]) {
      g.spin[s] = 0; g.ctl[s] = 0; g.latch[s] = 0; g.phaserTimer[s] = -1; g.phaserShown[s] = false;
      g.hyperStep[s] = 0; g.lastHit[s] = -1; g.exploding[s] = -1;
      continue;
    }
    g.spin[s] = r.i8(); g.ctl[s] = r.u8(); g.latch[s] = r.u8(); g.shield[s] = r.i8(); g.phaserTimer[s] = r.i8();
    g.phaserShown[s] = r.u8() === 1;
    g.phaserFrom[s] = [r.i16(), r.i16(), r.i16(), r.i16()];
    g.hyperStep[s] = r.u8(); g.lastHit[s] = r.i8(); g.exploding[s] = r.i16();
  }
  const mask: number[] = [];
  for (let k = 0; k < g.slots / 8; k++) mask.push(r.u8());
  for (let i = 0; i < g.slots; i++) {
    if (!(mask[i >> 3] & (1 << (i & 7)))) {
      g.state[i] = 0; g.redraw[i] = false; g.drawn[i] = false; g.anim[i] = 0;
      continue;
    }
    g.px[i] = r.i32(); g.py[i] = r.i32(); g.vx[i] = r.i32(); g.vy[i] = r.i32();
    g.oldx[i] = r.i16(); g.oldy[i] = r.i16();
    g.state[i] = r.i8(); g.angle[i] = r.u8(); g.oldangle[i] = r.u8();
    const b = r.u8();
    g.redraw[i] = !!(b & 1); g.drawn[i] = !!(b & 2);
    g.energy[i] = r.i8(); g.anim[i] = r.u8();
  }
  g.labels = r.u8(); g.soundFlags = r.u8(); g.soundCount = r.u8();
  const rng: number[] = [];
  for (let n = 0; n < 6; n++) rng.push(r.u8());
  g.rng.restore(rng);
  for (let s = 0; s < g.ships; s++) {
    if (g.hyperStep[s]) g.hyperSeed[s] = r.u32();
    if (g.exploding[s] >= 0) g.exSeed[s] = r.u32();
  }
  g.rebuildParticles();
  for (let s = 0; s < g.ships; s++) g.phaserLine[s] = g.phaserShown[s] ? g.phaserPixels(s) : [];
}

/** A game ready to load this world. */
export function gameFor(bytes: Uint8Array, seed = 1): Game {
  const g = new Game(seed, undefined, worldShips(bytes));
  loadWorld(g, bytes);
  return g;
}
