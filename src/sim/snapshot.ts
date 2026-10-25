// A whole world in bytes, so the host can send it and a new host can carry on
// from it (ticket, Phase 3). Loading it and running the same Inputs gives the
// same game, tick for tick.

import type { Game } from './game';

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
  i16(): number { const v = this.view.getInt16(this.at); this.at += 2; return v; }
  i32(): number { const v = this.view.getInt32(this.at); this.at += 4; return v; }
  u32(): number { const v = this.view.getUint32(this.at); this.at += 4; return v; }
}

const VERSION = 1;

export function saveWorld(g: Game): Uint8Array {
  const w = new Writer();
  w.u8(VERSION);
  w.u8(g.tick); w.u8(g.planetFrame); w.u32(g.starSeed);
  w.u8((g.options.planet ? 1 : 0) | (g.options.gravity ? 2 : 0) | (g.paused ? 4 : 0) | (g.soundOn ? 8 : 0)
    | (g.options.robot[0] ? 16 : 0) | (g.options.robot[1] ? 32 : 0));
  w.i16(g.wins[0]); w.i16(g.wins[1]);
  for (let i = 0; i < 16; i++) {
    w.i32(g.px[i]); w.i32(g.py[i]); w.i32(g.vx[i]); w.i32(g.vy[i]);
    w.i16(g.oldx[i]); w.i16(g.oldy[i]);
    w.i8(g.state[i]); w.u8(g.angle[i]); w.u8(g.oldangle[i]);
    w.u8((g.redraw[i] ? 1 : 0) | (g.drawn[i] ? 2 : 0));
    w.i8(g.energy[i]); w.u8(g.anim[i]);
  }
  for (let s = 0; s < 2; s++) {
    w.i8(g.spin[s]); w.u8(g.ctl[s]); w.u8(g.latch[s]); w.i8(g.shield[s]); w.i8(g.phaserTimer[s]);
    w.u8(g.phaserShown[s] ? 1 : 0);
    for (const v of g.phaserFrom[s]) w.i16(v);
    w.u8(g.hyperStep[s]);
  }
  w.u8(g.labels); w.u8(g.soundFlags); w.u8(g.soundCount);
  for (const b of g.rng.state()) w.u8(b);
  const ex = g.explosion;
  w.u8(ex ? 1 + ex.ship : 0); w.i16(ex ? ex.ticks : 0);
  // Particles only while something uses them: a hyperspace cloud or a ship's explosion.
  const used = ex ? 90 : g.hyperStep[1] ? 64 : g.hyperStep[0] ? 32 : 0;
  w.u8(used);
  for (let n = 0; n < used; n++) { w.i32(g.dx[n]); w.i32(g.dy[n]); w.i16(g.dvx[n]); w.i16(g.dvy[n]); }
  return w.bytes();
}

export function loadWorld(g: Game, bytes: Uint8Array): void {
  const r = new Reader(bytes);
  if (r.u8() !== VERSION) throw new Error('world version');
  g.tick = r.u8(); g.planetFrame = r.u8(); g.starSeed = r.u32();
  const f = r.u8();
  // Whether sound is on stays each player's own (bit 8 is ignored).
  g.options.planet = !!(f & 1); g.options.gravity = !!(f & 2); g.paused = !!(f & 4);
  g.options.robot = [!!(f & 16), !!(f & 32)];
  g.wins = [r.i16(), r.i16()];
  for (let i = 0; i < 16; i++) {
    g.px[i] = r.i32(); g.py[i] = r.i32(); g.vx[i] = r.i32(); g.vy[i] = r.i32();
    g.oldx[i] = r.i16(); g.oldy[i] = r.i16();
    g.state[i] = r.i8(); g.angle[i] = r.u8(); g.oldangle[i] = r.u8();
    const b = r.u8();
    g.redraw[i] = !!(b & 1); g.drawn[i] = !!(b & 2);
    g.energy[i] = r.i8(); g.anim[i] = r.u8();
  }
  for (let s = 0; s < 2; s++) {
    g.spin[s] = r.i8(); g.ctl[s] = r.u8(); g.latch[s] = r.u8(); g.shield[s] = r.i8(); g.phaserTimer[s] = r.i8();
    g.phaserShown[s] = r.u8() === 1;
    g.phaserFrom[s] = [r.i16(), r.i16(), r.i16(), r.i16()];
    g.hyperStep[s] = r.u8();
  }
  g.labels = r.u8(); g.soundFlags = r.u8(); g.soundCount = r.u8();
  const rng: number[] = [];
  for (let n = 0; n < 6; n++) rng.push(r.u8());
  g.rng.restore(rng);
  const ex = r.u8();
  const ticks = r.i16();
  g.explosion = ex ? { ship: (ex - 1) as 0 | 1, ticks } : null;
  const used = r.u8();
  for (let n = 0; n < used; n++) { g.dx[n] = r.i32(); g.dy[n] = r.i32(); g.dvx[n] = r.i16(); g.dvy[n] = r.i16(); }
  for (let s = 0; s < 2; s++) g.phaserLine[s] = g.phaserShown[s] ? g.phaserPixels(s) : [];
}
