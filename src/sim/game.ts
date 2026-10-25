// The DOS game's play, routine by routine from citizenwars/docs/original.md,
// for any number of ships (ticket, Decisions: how a system holds more than two
// ships). Positions and velocities are 16.16 fixed point kept as whole numbers
// (value * 65536), so every sum is the code's own integer sum. With two ships
// and the 'original' rules it is the 1985 game exactly.

import { Screen } from '../screen';
import { Rng } from './rng';
import { sin, cos } from './tables';
import { Key, NO_INPUT, type Input } from './input';
import { defensive, offensive, type RobotView } from './robot';
import {
  shipLeft, shipRight, torpedoLeft, torpedoRight, torpedoExplosion, planet as planetSheet,
} from '../design/bitmaps';
import { BAR } from '../design/tokens';
import { icons, ICON } from '../design/icons';

const F = 65536;
/** How many main-loop passes run each tick (ticket, Decisions). */
export const PASSES_PER_TICK = 2;
/** Ship explosion: 128 frames; one every 3 ticks and a 60-tick hold make the 6.1 s measured in DOSBox-X. */
export const EXPLOSION_FRAMES = 128;
export const EXPLOSION_TICKS_PER_FRAME = 3;
export const EXPLOSION_HOLD_TICKS = 60;
export const EXPLOSION_TICKS = EXPLOSION_FRAMES * EXPLOSION_TICKS_PER_FRAME + EXPLOSION_HOLD_TICKS;
export const MAX_SHIPS = 16;

export { Key } from './input';

const hi = (v: number) => Math.floor(v / F);
const lo = (v: number) => v - hi(v) * F;
const byte = (v: number) => ((v % 256) + 256) % 256;
const sbyte = (v: number) => { const b = byte(v); return b >= 128 ? b - 256 : b; };

/**
 * 'original': two ships, a death freezes the game and ends the round (the DOS game).
 * 'last-standing': deaths explode in play; the round ends with one ship left.
 * 'respawn': a destroyed ship comes back after its explosion; kills are counted.
 */
export type Rules = 'original' | 'last-standing' | 'respawn';

export interface Options { planet: boolean; gravity: boolean; robot: boolean[] }

export interface Speaker { on: boolean; divisor: number }

/** A star in play: the DOS planet's sprite, box and spring pull, scaled (ticket, Decisions: what is a system's star). */
export interface Body { x: number; y: number; pull: number; box: number; scale: number }

/** Field size for n ships: k = √(n/2) times the DOS screen each way, in whole bytes. */
export function fieldSize(n: number): { w: number; h: number } {
  if (n <= 2) return { w: 640, h: 200 };
  const k = Math.sqrt(n / 2);
  return { w: Math.round((640 * k) / 8) * 8, h: Math.round((200 * k) / 8) * 8 };
}

export class Game {
  readonly screen: Screen;
  readonly rng: Rng;
  readonly ships: number;
  readonly slots: number;
  rules: Rules = 'original';
  options: Options;
  paused = false;
  soundOn = false;
  /** Which ship's shield the low-shield warning listens to; null for both, as the DOS game. */
  listener: number | null = null;
  wins: number[];
  kills: number[];
  deaths: number[];
  /** Each player's Input this tick, from their keys, a robot or the network. */
  inputs: Input[];
  /** Which ships are in play; an absent side has no ship. */
  present: boolean[];
  w = 640;
  h = 200;
  bodies: Body[] = [];

  tick = 0;
  planetFrame = 0;

  // Object slots: ship s is slot 8s, its seven torpedoes 8s+1 to 8s+7.
  px: number[]; py: number[]; vx: number[]; vy: number[];
  oldx: number[]; oldy: number[]; state: number[]; angle: number[]; oldangle: number[];
  redraw: boolean[]; drawn: boolean[]; energy: number[]; anim: number[];
  spin: number[]; ctl: number[]; latch: number[]; shield: number[]; phaserTimer: number[];
  phaserLine: number[][];
  /** Each phaser's start, as [angle, x, y, steps reached], and whether it is on screen. */
  phaserFrom: number[][];
  phaserShown: boolean[];
  /** Who last hurt each ship, for the kill count; -1 for no one. */
  lastHit: number[];
  starSeed = 0;
  labels = 0;

  // Hyperspace clouds: 32 particles a ship. Explosions: 90 a ship.
  hx: number[]; hy: number[]; hvx: number[]; hvy: number[];
  hyperStep: number[];
  ex: number[]; ey: number[]; evx: number[]; evy: number[];
  /** Ticks since each ship's explosion began, -1 for none. */
  exploding: number[];
  /**
   * Each cloud's and explosion's particles come from their own seed, so a world
   * carries a few bytes for them and rebuilds the particles (`rebuildParticles`).
   */
  hyperSeed: number[];
  exSeed: number[];

  // Sound, as `02AB:27C0` keeps it.
  soundFlags = 0;
  soundCount = 0;
  speaker: Speaker = { on: false, divisor: 0 };

  constructor(seed: number, screen = new Screen(), ships = 2) {
    this.screen = screen;
    this.rng = new Rng(seed);
    this.ships = ships;
    this.slots = ships * 8;
    const n = (v: number, len = this.slots) => new Array<number>(len).fill(v);
    const b = (v: boolean, len = ships) => new Array<boolean>(len).fill(v);
    this.options = { planet: false, gravity: false, robot: b(false) };
    this.wins = n(0, ships); this.kills = n(0, ships); this.deaths = n(0, ships);
    this.inputs = new Array<Input>(ships).fill(NO_INPUT);
    this.present = b(ships === 2);
    this.px = n(0); this.py = n(0); this.vx = n(0); this.vy = n(0);
    this.oldx = n(0); this.oldy = n(0); this.state = n(0); this.angle = n(0); this.oldangle = n(0);
    this.redraw = b(false, this.slots); this.drawn = b(false, this.slots); this.energy = n(0); this.anim = n(0);
    this.spin = n(0, ships); this.ctl = n(0, ships); this.latch = n(0, ships); this.shield = n(0, ships);
    this.phaserTimer = n(-1, ships);
    this.phaserLine = Array.from({ length: ships }, () => []);
    this.phaserFrom = Array.from({ length: ships }, () => [0, 0, 0, 0]);
    this.phaserShown = b(false);
    this.lastHit = n(-1, ships);
    this.hx = n(0, ships * 32); this.hy = n(0, ships * 32); this.hvx = n(0, ships * 32); this.hvy = n(0, ships * 32);
    this.hyperStep = n(0, ships);
    this.ex = n(0, ships * 90); this.ey = n(0, ships * 90); this.evx = n(0, ships * 90); this.evy = n(0, ships * 90);
    this.exploding = n(-1, ships);
    this.hyperSeed = n(0, ships);
    this.exSeed = n(0, ships);
    this.bodies = [{ x: 319, y: 99, pull: 8, box: 16, scale: 1 }];
  }

  // ---- slots and the field ------------------------------------------------------

  x(i: number): number { return hi(this.px[i]); }
  y(i: number): number { return hi(this.py[i]); }
  alive(i: number): boolean { return this.state[i] > 0; }
  ship(side: number): number { return side * 8; }
  owner(slot: number): number { return slot >> 3; }
  get explosion(): { ship: number; ticks: number } | null {
    const s = this.exploding.findIndex((t) => t >= 0);
    return s < 0 ? null : { ship: s, ticks: this.exploding[s] };
  }

  /** Wrap a whole-pixel x or y into the field [8, size-8), as `02AB:22DC` does for 640 and 200. */
  private wrapField(v: number, size: number): number {
    if (v < 0) v += size;
    if (v < 8) v += size - 16; else if (v >= size - 8) v -= size - 16;
    return v;
  }

  private randField(size: number): number {
    let mask = 1;
    while (mask < size) mask <<= 1;
    for (;;) {
      const v = this.rng.next() & (mask - 1);
      if (v >= 8 && v < size - 8) return v;
    }
  }

  /** Resize the field for the ships present, moving everything with it. */
  setField(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const sx = w / this.w;
    const sy = h / this.h;
    for (let i = 0; i < this.slots; i++) {
      this.px[i] = Math.round(this.px[i] * sx);
      this.py[i] = Math.round(this.py[i] * sy);
      this.oldx[i] = Math.round(this.oldx[i] * sx);
      this.oldy[i] = Math.round(this.oldy[i] * sy);
    }
    for (const b of this.bodies) { b.x = Math.round((b.x + 1) * sx) - 1; b.y = Math.round((b.y + 1) * sy) - 1; }
    this.w = w;
    this.h = h;
  }

  /** The stars of a system around the field's centre (a second and third set by their share of the mass). */
  setStars(stars: { mass: number; radius: number }[]): void {
    const cx = this.w / 2 - 1;
    const cy = this.h / 2 - 1;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const total = stars.reduce((t, s) => t + s.mass, 0) || 1;
    const spread = this.w / 5;
    this.bodies = stars.slice(0, 3).map((s, n) => {
      const scale = clamp(s.radius, 0.5, 2);
      const pull = Math.round(8 * clamp(s.mass, 0.25, 3));
      let x = cx;
      let y = cy;
      if (stars.length > 1) {
        const a = (n / Math.min(stars.length, 3)) * 2 * Math.PI;
        const r = spread * (1 - s.mass / total);
        x = Math.round(cx + Math.cos(a) * r);
        y = Math.round(cy + Math.sin(a) * r * (this.h / this.w) * 2);
      }
      return { x, y, pull, box: Math.round(16 * scale), scale };
    });
  }

  /** Start point n of the field: on the ellipse through the DOS game's two, facing round it. */
  startPoint(n: number, of = this.ships): [number, number, number] {
    if (of <= 2 && this.w === 640 && this.h === 200) return n === 0 ? [160, 46, 0] : [480, 138, 128];
    const k = this.w / 640;
    const t = (5 * Math.PI) / 4 + (2 * Math.PI * n) / of;
    const x = Math.round(this.w / 2 + 226.27 * k * Math.cos(t));
    const y = Math.round(this.h / 2 - 8 * k + 65.05 * k * Math.sin(t));
    return [this.wrapField(x, this.w), this.wrapField(y, this.h), byte(Math.round((256 * n) / of))];
  }

  // ---- rounds -------------------------------------------------------------------

  /** Start a round (`02AB:1F29`): the ships present at their start points, a new starfield. */
  startRound(): void {
    for (const a of [this.px, this.py, this.vx, this.vy, this.oldx, this.oldy, this.state, this.angle, this.oldangle, this.energy, this.anim]) a.fill(0);
    this.redraw.fill(false); this.drawn.fill(false);
    this.spin.fill(0); this.ctl.fill(0); this.latch.fill(0); this.lastHit.fill(-1);
    this.phaserTimer.fill(-1); this.phaserShown.fill(false);
    for (let s = 0; s < this.ships; s++) this.phaserLine[s] = [];
    // A hyperspace cloud left over from the last round would teleport a ship; the original keeps it, this does not.
    this.hyperStep.fill(0);
    this.exploding.fill(-1);
    const count = this.present.filter(Boolean).length;
    let n = 0;
    for (let s = 0; s < this.ships; s++) if (this.present[s]) this.spawn(s, this.startPoint(n++, Math.max(2, count)));
    this.screen.clear();
    this.starSeed = (this.rng.next() | (this.rng.next() << 16)) >>> 0;
    this.stars();
    for (let s = 0; s < Math.min(2, this.ships); s++) if (this.present[s]) this.drawShip(s, true);
    this.labels = 0;
    for (let k = 0; k < 4; k++) this.toggleLabel(k);
    this.soundFlags = 0;
  }

  /** Put side s's ship in play at a point, as a round's start sets it. */
  spawn(s: number, [x, y, a]: [number, number, number]): void {
    const i = this.ship(s);
    this.px[i] = x * F; this.py[i] = y * F; this.vx[i] = 0; this.vy[i] = 0;
    this.oldx[i] = x; this.oldy[i] = y;
    this.angle[i] = a; this.oldangle[i] = a; this.state[i] = 1;
    this.energy[i] = 127; this.shield[s] = 31;
    this.spin[s] = 0; this.ctl[s] = 0; this.latch[s] = 0; this.lastHit[s] = -1;
    this.redraw[i] = true;
  }

  /** The start point farthest from every other ship, for a ship arriving or coming back. */
  freestStart(s: number): [number, number, number] {
    const count = Math.max(2, this.present.filter(Boolean).length);
    let best: [number, number, number] = this.startPoint(0, count);
    let bestD = -1;
    for (let n = 0; n < count; n++) {
      const p = this.startPoint(n, count);
      let d = Infinity;
      for (let o = 0; o < this.ships; o++) {
        if (o === s || !this.alive(this.ship(o))) continue;
        d = Math.min(d, Math.max(Math.abs(p[0] - this.x(this.ship(o))), Math.abs(p[1] - this.y(this.ship(o)))));
      }
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** A player arrives: their ship joins the round at the freest start point. */
  arrive(s: number): void {
    this.present[s] = true;
    this.spawn(s, this.freestStart(s));
  }

  /** A player leaves: their ship and torpedoes go. */
  leave(s: number): void {
    this.present[s] = false;
    for (let i = this.ship(s); i < this.ship(s) + 8; i++) { this.state[i] = 0; this.drawn[i] = false; }
    this.exploding[s] = -1;
    this.hyperStep[s] = 0;
    this.phaserShown[s] = false;
  }

  /**
   * 512 random pixels in [8, 632) x [8, 192), XOR (`02AB:2932`). They come from
   * their own seed, so a world sent over the network carries its sky in 4 bytes.
   */
  stars(): void {
    for (const [x, y] of this.starPoints()) this.screen.xorPixel(x, y);
  }

  starPoints(): [number, number][] {
    const r = new Rng(this.starSeed);
    const out: [number, number][] = [];
    for (let n = 0; n < 512; n++) out.push([r.x(), r.y()]);
    return out;
  }

  // ---- drawing, where and when the original draws (two ships) ---------------------

  private drawShip(side: number, show: boolean): void {
    if (side > 1) return;
    const i = this.ship(side);
    if (this.drawn[i] === show) return;
    const frame = ((this.oldangle[i] + 8) & 0xf0) >> 4;
    this.screen.blit(side ? shipRight : shipLeft, frame, this.oldx[i], this.oldy[i]);
    this.drawn[i] = show;
  }

  private toggleTorpedo(i: number): void {
    if (i >= 16) return;
    const frame = ((this.oldangle[i] + 16) & 0xe0) >> 5;
    this.screen.blit(i < 8 ? torpedoLeft : torpedoRight, frame, this.oldx[i], this.oldy[i]);
    this.drawn[i] = !this.drawn[i];
  }

  private saveOld(i: number): void {
    this.oldx[i] = this.x(i);
    this.oldy[i] = this.y(i);
    this.oldangle[i] = this.angle[i];
    this.redraw[i] = false;
  }

  /** The shield and energy icons (once the S and E labels): bit 0 left S, 1 right S, 2 left E, 3 right E (`02AB:1BED`). */
  toggleLabel(n: number): void {
    const x = n & 1 ? BAR.labelRightX : BAR.labelLeftX;
    const y = n < 2 ? BAR.shieldY : BAR.energyY;
    this.screen.blit(icons, n < 2 ? ICON.shield : ICON.energy, x, y);
    this.labels ^= 1 << n;
  }

  private bars(): void {
    if (this.ships < 2) return;
    this.screen.bar(this.shield[0], BAR.shieldY, true);
    this.screen.bar(this.energy[0], BAR.energyY, true);
    this.screen.bar(this.shield[1], BAR.shieldY, false);
    this.screen.bar(this.energy[8], BAR.energyY, false);
  }

  // ---- one tick: the timer interrupt (`02AB:233D`) ---------------------------

  step(): 'play' | 'round-over' {
    if (this.rules === 'original' && this.explosion) return this.explosionStep(this.explosion.ship);
    if (!this.paused) {
      for (let n = 0; n < PASSES_PER_TICK; n++) {
        this.pass();
        if (this.rules === 'original' && this.explosion) return 'play';
      }
    }
    this.timer();
    if (this.rules === 'original' || this.paused) return 'play';
    let over = false;
    for (let s = 0; s < this.ships; s++) if (this.exploding[s] >= 0 && this.explosionStep(s) === 'round-over') over = true;
    if (this.rules === 'last-standing') {
      const flying = this.present.filter((p, s) => p && (this.state[this.ship(s)] > 0 || this.hyperStep[s])).length;
      const booming = this.exploding.some((t) => t >= 0);
      if (this.present.filter(Boolean).length > 1 && flying <= 1 && !booming) {
        this.present.forEach((p, s) => { if (p && this.state[this.ship(s)] > 0) this.wins[s]++; });
        return 'round-over';
      }
    }
    return over && this.rules !== 'respawn' ? 'round-over' : 'play';
  }

  timer(): void {
    this.tick = byte(this.tick + 1);
    if (!this.paused) {
      for (let s = 0; s < this.ships; s++) this.shipTick(s);
      for (let i = 0; i < this.slots; i++) {
        if (!this.alive(i)) continue;
        this.move(i);
        if (this.options.gravity) this.gravity(i);
      }
      if ((this.tick & 0x1f) === 0) this.lowShield();
      if (this.tick === 0) {
        for (let s = 0; s < this.ships; s++) {
          const i = this.ship(s);
          const e = this.energy[i];
          if (e !== 0 && e + 1 <= 127) this.energy[i] = sbyte(e + 1);
        }
      }
      if ((this.tick & 0xf) === 0) {
        for (let i = 0; i < this.slots; i++) {
          if (!(i & 7) || !this.alive(i)) continue;
          if (this.energy[i] !== 0) this.energy[i]--;
        }
      }
      for (let s = 0; s < this.ships; s++) {
        const t = this.phaserTimer[s];
        if (t >= 0 && t !== 0x14) this.phaserTimer[s] = t - 1;
      }
      this.sound();
      for (let s = 0; s < this.ships; s++) if (this.hyperStep[s]) this.hyperTravel(s);
    }
    if ((this.tick & 0xf) === 0 && this.options.planet) {
      this.planetFrame = (this.planetFrame + 1) & 15;
      if (this.w === 640 && this.h === 200) for (const b of this.bodies) this.screen.blitOpaque(planetSheet, this.planetFrame, b.x, b.y);
    }
  }

  private shipTick(s: number): void {
    const i = this.ship(s);
    if (this.state[i] === 0) return;
    this.angle[i] = byte(this.angle[i] + this.spin[s]);
    if (this.ctl[s] & 1) {
      if ((this.tick & 0x1f) === 0) {
        this.energy[i] = sbyte(this.energy[i] - 1);
        if (this.energy[i] === 0) return;
      }
      // Impulse: (cos, sin) / 8, the whole part kept only below 8 a tick (`02AB:23B8`).
      this.vx[i] = this.thrust(this.vx[i], Math.floor(cos(this.angle[i]) / 8));
      this.vy[i] = this.thrust(this.vy[i], Math.floor(sin(this.angle[i]) / 8));
    }
    if ((this.ctl[s] & 2) && (this.tick & 0x1f) === 0) this.energy[i] = sbyte(this.energy[i] - 1);
  }

  private thrust(v: number, t: number): number {
    const n = v + t;
    return Math.abs(hi(n)) < 8 ? n : hi(v) * F + lo(n);
  }

  /** `02AB:22C6`: move, wrapping in x [8, w-8) and y [8, h-8). */
  move(i: number): void {
    let p = this.px[i] + this.vx[i];
    let x = hi(p);
    const fx = p - x * F;
    x = this.wrapField(x, this.w);
    this.px[i] = x * F + fx;
    if (x !== this.oldx[i]) this.redraw[i] = true;
    p = this.py[i] + this.vy[i];
    let y = hi(p);
    const fy = p - y * F;
    y = this.wrapField(y, this.h);
    this.py[i] = y * F + fy;
    if (y !== this.oldy[i]) this.redraw[i] = true;
  }

  /** `02AB:1E30`: velocity -= pull * (position - star) / 65536 a tick, a spring for each star. */
  gravity(i: number): void {
    for (const b of this.bodies) {
      this.vx[i] -= b.pull * (this.x(i) - b.x);
      this.vy[i] -= b.pull * (this.y(i) - b.y);
    }
  }

  /** Every 32 ticks: the warning tone and the blinking S below 16 shield (`02AB:24A4`). */
  private lowShield(): void {
    this.soundFlags &= ~1;
    if (this.listener !== null) {
      if (this.alive(this.ship(this.listener)) && this.shield[this.listener] < 16) this.soundFlags |= 1;
      return;
    }
    // The right side's check reads the left ship's state, as the original does.
    for (const s of [0, 1]) {
      if (!this.alive(0)) continue;
      if (this.shield[s] < 16) {
        this.soundFlags |= 1;
        this.toggleLabel(s);
      } else if (!(this.labels & (1 << s))) {
        this.toggleLabel(s);
      }
    }
  }

  // ---- one pass of the main loop (`02AB:00CD`) -------------------------------

  pass(): void {
    for (let s = 0; s < this.ships; s++) {
      const i = this.ship(s);
      if (this.phaserTimer[s] === 0x14) {
        this.xorLine(this.phaserLine[s]);
        this.phaserShown[s] = false;
        this.phaserTimer[s]--;
      }
      if (this.state[i] === 0) {
        this.drawShip(s, false);
      } else if (this.state[i] > 0) {
        this.input(s);
        if (this.ctl[s] & 2) {
          this.drawShip(s, false);
        } else {
          if (this.redraw[i]) {
            this.drawShip(s, false);
            this.saveOld(i);
          }
          this.drawShip(s, true);
        }
      }
      for (let i2 = i + 1; i2 < i + 8; i2++) {
        if (!this.alive(i2) || !this.redraw[i2]) continue;
        this.toggleTorpedo(i2);
        if (this.energy[i2] === 0) {
          this.redraw[i2] = false;
          this.state[i2] = -1;
          continue;
        }
        this.saveOld(i2);
        this.toggleTorpedo(i2);
      }
    }
    this.collisions();
    this.torpedoExplosions();
    this.bars();
    for (let s = 0; s < this.ships; s++) {
      if (this.shield[s] < 0 && this.state[this.ship(s)] > 0) {
        this.die(s);
        if (this.rules === 'original') return;
      }
    }
  }

  // ---- keys ------------------------------------------------------------------

  private input(s: number): void {
    this.applyInput(s, this.options.robot[s] ? this.robotInput(s) : this.inputs[s]);
  }

  /** One player's Input for a pass: the aim if any, then every key's press or release handler. */
  applyInput(s: number, input: Input): void {
    const i = this.ship(s);
    this.spin[s] = 0;
    if (input.aim >= 0 && input.aim !== this.angle[i]) {
      this.angle[i] = input.aim;
      this.redraw[i] = true;
    }
    for (let k = 8; k >= 0; k--) {
      if (input.keys & (1 << k)) this.press(s, k); else this.release(s, k);
    }
  }

  /** The press handlers (`02AB:0297`, `02AB:04EE`). */
  press(s: number, k: number): void {
    const i = this.ship(s);
    switch (k) {
      case Key.CW: this.spin[s] = 2; this.redraw[i] = true; break;
      case Key.CCW: this.spin[s] = -2; this.redraw[i] = true; break;
      case Key.Shield:
        if ((this.tick & 3) === 0 && this.energy[i] - 1 >= 0 && this.shield[s] + 1 <= 127) {
          this.shield[s]++; this.energy[i]--;
        }
        break;
      case Key.Weapon:
        if ((this.tick & 3) === 0 && this.shield[s] - 1 >= 0 && this.energy[i] + 1 <= 127) {
          this.shield[s]--; this.energy[i]++;
        }
        break;
      case Key.Phaser:
        if (this.phaserTimer[s] < 0 && this.energy[i] - 1 >= 0) {
          this.energy[i]--;
          this.phaserTimer[s] = 0x18;
          this.firePhaser(s);
        }
        break;
      case Key.Photon:
        if (this.latch[s] & 1 || this.energy[i] < 0) break;
        this.latch[s] |= 1;
        for (let t = i + 1; t < i + 8; t++) {
          if (this.state[t] === 0) { this.launch(s, t); break; }
        }
        break;
      case Key.Impulse:
        if (this.energy[i] < 0) this.release(s, k); else this.ctl[s] |= 1;
        break;
      case Key.Cloak:
        if (this.energy[i] < 0) this.release(s, k); else this.ctl[s] |= 2;
        break;
      case Key.Hyper:
        if (this.latch[s] & 2) break;
        this.latch[s] |= 2;
        if (this.energy[i] - 8 < 0) break;
        this.energy[i] -= 8;
        this.hyperspace(s);
        break;
    }
  }

  /** The release handlers (`02AB:0285`, `02AB:04DC`). */
  release(s: number, k: number): void {
    switch (k) {
      case Key.Photon: this.latch[s] &= ~1; break;
      case Key.Impulse: this.ctl[s] &= ~1; break;
      case Key.Cloak: this.ctl[s] &= ~2; break;
      case Key.Hyper: this.latch[s] &= ~2; break;
    }
  }

  // ---- torpedoes ---------------------------------------------------------------

  /** `02AB:2950`: 16 px ahead, 2 px a tick plus the ship's velocity, 40 units of life. */
  private launch(s: number, t: number): void {
    const i = this.ship(s);
    const a = this.angle[i];
    this.state[t]++;
    const dx = cos(a) * 4;
    const dy = sin(a) * 4;
    const x = this.wrapField(hi(dx * 8) + this.x(i), this.w);
    const y = this.wrapField(hi(dy * 8) + this.y(i), this.h);
    // Offline the fraction of a reused slot is not reset, as in the original;
    // online it is, since a world does not carry slots that are empty.
    const keep = this.rules === 'original';
    this.px[t] = x * F + (keep ? lo(this.px[t]) : 0);
    this.py[t] = y * F + (keep ? lo(this.py[t]) : 0);
    this.oldx[t] = x; this.oldy[t] = y;
    this.angle[t] = a; this.oldangle[t] = a;
    this.vx[t] = dx + this.vx[i];
    this.vy[t] = dy + this.vy[i];
    this.energy[t] = 0x28;
    this.energy[i] = sbyte(this.energy[i] - 1);
    this.toggleTorpedo(t);
    this.soundFlags |= 4;
  }

  /** `02AB:08FF`: an exploding torpedo's counter rises 2 a pass to 128, a frame XORed every 4 passes. */
  private torpedoExplosions(): void {
    for (let i = 0; i < this.slots; i++) {
      if (this.state[i] >= 0) continue;
      this.anim[i] += 2;
      if (this.anim[i] >= 128) {
        this.anim[i] = 0;
        this.state[i] = 0;
        this.soundFlags &= ~8;
      } else {
        this.soundFlags |= 8;
        if (this.anim[i] & 7) continue;
      }
      if (i < 16) this.screen.blit(torpedoExplosion, (this.anim[i] & 0x38) >> 3, this.x(i), this.y(i));
    }
  }

  private destroy(i: number): void {
    this.toggleTorpedo(i);
    this.redraw[i] = false;
    this.state[i] = -1;
  }

  /** A ship loses shield; `by` is the side that did it, or -1. */
  private hurt(s: number, amount: number, by: number): void {
    this.shield[s] = sbyte(this.shield[s] - amount);
    if (by >= 0 && by !== s) this.lastHit[s] = by;
  }

  // ---- collisions (`02AB:18A0`) ------------------------------------------------

  private near(a: number, b: number, box: number): boolean {
    if (!this.alive(a) || !this.alive(b)) return false;
    return Math.abs(this.y(a) - this.y(b)) < box && Math.abs(this.x(a) - this.x(b)) < box;
  }

  private collisions(): void {
    const n = this.ships;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (this.near(this.ship(a), this.ship(b), 16)) this.bounce(a, b);
    // Each ship against every other side's torpedoes, then its own, as the original orders them.
    for (let s = 0; s < n; s++) {
      const owners = [...Array.from({ length: n }, (_, o) => o).filter((o) => o !== s), s];
      for (const o of owners) {
        for (let t = this.ship(o) + 1; t < this.ship(o) + 8; t++) {
          if (!this.near(this.ship(s), t, 8)) continue;
          this.destroy(t);
          this.hurt(s, 4, o);
        }
      }
    }
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        for (let a = this.ship(p) + 1; a < this.ship(p) + 8; a++) {
          for (let b = this.ship(q) + 1; b < this.ship(q) + 8; b++) {
            if (!this.near(a, b, 6)) continue;
            this.destroy(b);
            this.destroy(a);
          }
        }
      }
    }
    if (!this.options.planet) return;
    for (const body of this.bodies) {
      for (let i = 0; i < this.slots; i++) {
        if (!this.alive(i)) continue;
        if (Math.abs(this.x(i) - body.x) >= body.box || Math.abs(this.y(i) - body.y) >= body.box) continue;
        if (!(i & 7)) this.hurt(this.owner(i), 2, -1);
        else this.destroy(i);
      }
    }
  }

  /** Ships touching: swap velocities halved, push 2 px apart, no damage. */
  private bounce(sa: number, sb: number): void {
    const a = this.ship(sa);
    const b = this.ship(sb);
    const [avx, avy, bvx, bvy] = [this.vx[a], this.vy[a], this.vx[b], this.vy[b]];
    this.vx[a] = Math.floor(bvx / 2); this.vy[a] = Math.floor(bvy / 2);
    this.vx[b] = Math.floor(avx / 2); this.vy[b] = Math.floor(avy / 2);
    const apart = (p: number, q: number, size: number): [number, number] => {
      if (q - p >= 0) { p -= 2; q += 2; } else { p += 2; q -= 2; }
      if (p < 0) p += size; else if (p >= size) p -= size;
      if (q < 0) q += size; else if (q >= size) q -= size;
      return [p, q];
    };
    const [ax, bx] = apart(this.x(a), this.x(b), this.w);
    const [ay, by] = apart(this.y(a), this.y(b), this.h);
    this.px[a] = ax * F + lo(this.px[a]); this.px[b] = bx * F + lo(this.px[b]);
    this.py[a] = ay * F + lo(this.py[a]); this.py[b] = by * F + lo(this.py[b]);
    this.redraw[a] = true; this.redraw[b] = true;
  }

  // ---- phasers (`02AB:2006`, `02AB:20A6`) --------------------------------------

  private firePhaser(s: number): void {
    const i = this.ship(s);
    this.soundCount = 0;
    this.soundFlags |= 2;
    this.phaserLine[s] = this.traceLine(this.angle[i], this.x(i), this.y(i), true, 0x60, s);
    this.phaserFrom[s] = [this.angle[i], this.x(i), this.y(i), 8 + this.phaserLine[s].length / 2];
    this.phaserShown[s] = true;
    this.xorLine(this.phaserLine[s]);
  }

  /** A phaser's pixels again from where it started, without hitting anything (for a loaded world). */
  phaserPixels(s: number): number[] {
    const [a, x, y, last] = this.phaserFrom[s];
    return this.traceLine(a, x, y, false, last);
  }

  private xorLine(pixels: number[]): void {
    if (this.w !== 640 || this.h !== 200) return;
    for (let n = 0; n < pixels.length; n += 2) this.screen.xorPixel(pixels[n], pixels[n + 1]);
  }

  /** The phaser's stepped line, pixels from step 9 to 96, testing hits every 8th step. */
  traceLine(angle: number, x: number, y: number, hits: boolean, last = 0x60, by = -1): number[] {
    let ix = cos(angle);
    let iy = sin(angle);
    const left = ix < 0;
    const up = iy < 0;
    ix = Math.abs(ix);
    iy = Math.abs(iy);
    // Shift both until one has its top bit set, x tested first.
    for (;;) {
      ix = (ix << 1) & 0xffff;
      if (ix & 0x8000) { iy = (iy << 1) & 0xffff; break; }
      iy = (iy << 1) & 0xffff;
      if (iy & 0x8000) break;
    }
    const W = this.w;
    const H = this.h;
    let ax = 0;
    let ay = 0;
    const out: number[] = [];
    let steps = 0;
    for (;;) {
      let moved = 0;
      ax += ix;
      if (ax > 0xffff) { ax &= 0xffff; moved++; x = left ? (x === 0 ? W - 1 : x - 1) : (x + 1 >= W ? 0 : x + 1); }
      ay += iy;
      if (ay > 0xffff) { ay &= 0xffff; moved++; y = up ? (y === 0 ? H - 1 : y - 1) : (y + 1 >= H ? 0 : y + 1); }
      if (!moved) continue;
      steps++;
      if (steps < 9) continue;
      out.push(x, y);
      if (hits && (steps & 7) === 0 && this.phaserHit(x, y, by)) break;
      if (steps >= last) break;
    }
    return out;
  }

  /** `02AB:222E`: a ship inside 8 px loses 2 shield, a torpedo is destroyed, a star stops it. */
  private phaserHit(x: number, y: number, by: number): boolean {
    for (let i = 0; i < this.slots; i++) {
      if (!this.alive(i)) continue;
      if (Math.abs(y - this.y(i)) >= 8 || Math.abs(x - this.x(i)) >= 8) continue;
      if (!(i & 7)) this.hurt(this.owner(i), 2, by);
      else this.destroy(i);
      return true;
    }
    if (!this.options.planet) return false;
    return this.bodies.some((b) => Math.abs(y - b.y) < b.box && Math.abs(x - b.x) < b.box);
  }

  // ---- hyperspace (`02AB:06F6`) ----------------------------------------------

  private hyperspace(s: number): void {
    const i = this.ship(s);
    this.state[i] = 0;
    this.redraw[i] = false;
    const nx = this.randField(this.w);
    const ny = this.randField(this.h);
    this.px[i] = nx * F;
    this.py[i] = ny * F;
    this.vx[i] = (nx - this.oldx[i]) * 1024;
    this.vy[i] = (ny - this.oldy[i]) * 1024;
    this.hyperSeed[s] = (this.rng.next() | (this.rng.next() << 16)) >>> 0;
    this.seedCloud(s);
    for (let n = 0; n < 32; n++) this.particle(this.oldx[i], this.oldy[i]);
    this.hyperStep[s] = 1;
    this.soundFlags |= 0x10;
  }

  /** Side s's hyperspace cloud at its start: 32 particles from its seed, at the ship's last place. */
  private seedCloud(s: number): void {
    const i = this.ship(s);
    const r = new Rng(this.hyperSeed[s]);
    for (let n = s * 32; n < s * 32 + 32; n++) {
      this.hx[n] = this.oldx[i] * F;
      this.hy[n] = this.oldy[i] * F;
      this.hvx[n] = r.nextSigned();
      this.hvy[n] = r.nextSigned();
    }
  }

  /** Side s's explosion at its start: 90 particles from its seed. */
  private seedExplosion(s: number): void {
    const i = this.ship(s);
    const r = new Rng(this.exSeed[s]);
    for (let n = s * 90; n < s * 90 + 90; n++) {
      this.ex[n] = this.oldx[i] * F;
      this.ey[n] = this.oldy[i] * F;
      this.evx[n] = r.nextSigned();
      this.evy[n] = r.nextSigned();
    }
  }

  /** Every cloud and explosion under way, rebuilt from its seed and how far it has gone (for a loaded world). */
  rebuildParticles(): void {
    for (let s = 0; s < this.ships; s++) {
      const i = this.ship(s);
      if (this.hyperStep[s]) {
        this.seedCloud(s);
        for (let st = 1; st < this.hyperStep[s]; st++) {
          for (let n = s * 32; n < s * 32 + 32; n++) {
            if (st === 0x20) { this.hvx[n] = -this.hvx[n]; this.hvy[n] = -this.hvy[n]; }
            this.hx[n] = this.wrapFixed(this.hx[n] + this.hvx[n] * 2 + this.vx[i], this.w);
            this.hy[n] = this.wrapFixed(this.hy[n] + this.hvy[n] * 4 + this.vy[i], this.h);
          }
        }
      }
      if (this.exploding[s] >= 0) {
        this.seedExplosion(s);
        const frames = Math.min(EXPLOSION_FRAMES, Math.floor(this.exploding[s] / EXPLOSION_TICKS_PER_FRAME));
        for (let n = s * 90; n < s * 90 + 90; n++) {
          this.ex[n] = this.wrapFixed(this.ex[n] + this.evx[n] * frames, this.w);
          this.ey[n] = this.wrapFixed(this.ey[n] + this.evy[n] * frames, this.h);
        }
      }
    }
  }

  private particle(x: number, y: number): void {
    if (this.w === 640 && this.h === 200) this.screen.xorPixel(x, y);
  }

  /** The cloud's travel, 32 ticks out and 32 back while it carries the ship (`02AB:2587`). */
  private hyperTravel(s: number): void {
    const i = this.ship(s);
    const step = this.hyperStep[s];
    this.hyperStep[s] = step + 1;
    const base = s * 32;
    if (step === 0x40) {
      for (let n = base; n < base + 32; n++) this.particle(hi(this.hx[n]), hi(this.hy[n]));
      this.hyperStep[s] = 0;
      this.state[i] = 1;
      this.redraw[i] = true;
      const x = hi(this.hx[base]);
      const y = hi(this.hy[base]);
      this.px[i] = x * F; this.py[i] = y * F;
      this.oldx[i] = x; this.oldy[i] = y;
      this.vx[i] = 0; this.vy[i] = 0;
      this.soundFlags &= ~0x10;
      return;
    }
    if (step === 0x20) {
      for (let n = base; n < base + 32; n++) { this.hvx[n] = -this.hvx[n]; this.hvy[n] = -this.hvy[n]; }
    }
    for (let n = base; n < base + 32; n++) {
      this.particle(hi(this.hx[n]), hi(this.hy[n]));
      this.hx[n] = this.wrapFixed(this.hx[n] + this.hvx[n] * 2 + this.vx[i], this.w);
      this.hy[n] = this.wrapFixed(this.hy[n] + this.hvy[n] * 4 + this.vy[i], this.h);
      this.particle(hi(this.hx[n]), hi(this.hy[n]));
    }
  }

  private wrapFixed(p: number, size: number): number {
    let w = hi(p);
    const f = p - w * F;
    if (w < 0) w += size; else if (w >= size) w -= size;
    return w * F + f;
  }

  // ---- ship death (`02AB:07BC`, `02AB:07FC`) -----------------------------------

  private die(s: number): void {
    const i = this.ship(s);
    this.drawShip(s, false);
    this.state[i] = 0;
    this.spin[s] = 0;
    this.ctl[s] = 0;
    this.deaths[s]++;
    if (this.lastHit[s] >= 0) this.kills[this.lastHit[s]]++;
    if (this.rules === 'original') {
      this.wins[1 - s]++;
      this.soundFlags = 0x80;
    }
    this.exSeed[s] = (this.rng.next() | (this.rng.next() << 16)) >>> 0;
    this.seedExplosion(s);
    for (let n = 0; n < 90; n++) this.particle(this.oldx[i], this.oldy[i]);
    this.exploding[s] = 0;
  }

  /** One tick of side s's explosion: a frame every 3 ticks, then the hold. */
  private explosionStep(s: number): 'play' | 'round-over' {
    const t = ++this.exploding[s];
    const frames = EXPLOSION_FRAMES * EXPLOSION_TICKS_PER_FRAME;
    const base = s * 90;
    if (t <= frames && t % EXPLOSION_TICKS_PER_FRAME === 0) {
      for (let n = base; n < base + 90; n++) {
        this.particle(hi(this.ex[n]), hi(this.ey[n]));
        this.ex[n] = this.wrapFixed(this.ex[n] + this.evx[n], this.w);
        this.ey[n] = this.wrapFixed(this.ey[n] + this.evy[n], this.h);
        this.particle(hi(this.ex[n]), hi(this.ey[n]));
      }
      if (t === frames) for (let n = base; n < base + 90; n++) this.particle(hi(this.ex[n]), hi(this.ey[n]));
    }
    if (t < EXPLOSION_TICKS) return 'play';
    this.exploding[s] = -1;
    if (this.rules === 'original') {
      this.soundFlags = 0;
      return 'round-over';
    }
    if (this.rules === 'respawn' && this.present[s]) this.spawn(s, this.freestStart(s));
    return 'play';
  }

  /** How dense the explosion's clicks are now, 0..1: a click every (frame+1) particles (`02AB:080A`). */
  explosionClickRate(): number {
    const e = this.explosion;
    if (!e) return 0;
    const frame = Math.floor(e.ticks / EXPLOSION_TICKS_PER_FRAME);
    return frame >= EXPLOSION_FRAMES ? 0 : 1 / (frame + 1);
  }

  // ---- sound (`02AB:27C0`) -----------------------------------------------------

  get audible(): Speaker {
    return this.soundOn ? this.speaker : { on: false, divisor: 0 };
  }

  /**
   * The speaker, worked out whether sound is on or not and without the game's
   * random numbers, so two players with sound set differently stay in step;
   * `audible` is what to play (F8 toggles `soundOn`).
   */
  private sound(): void {
    const off = () => { this.soundFlags = 0; this.soundCount = 0; this.speaker = { on: false, divisor: 0 }; };
    const f = this.soundFlags;
    if (f & 0x80) return;
    if (!f) return off();
    if (f & 0x10) {
      const steps = this.hyperStep.reduce((a, b) => a + b, 0);
      this.speaker = { on: true, divisor: (steps & 255) * 256 };
    } else if (f & 2) {
      if (this.soundCount >= 128) return off();
      this.soundCount += 8;
      this.speaker = { on: true, divisor: byte(-this.soundCount) * 8 };
    } else if (f & 4) {
      if (this.soundCount === 0) {
        this.soundCount = 2;
        this.speaker = { on: true, divisor: 0x80 };
      } else if (--this.soundCount === 0) {
        off();
      }
    } else if (f & 1) {
      if ((this.tick & 0x1f) === 0) this.speaker = { on: true, divisor: this.tick & 0x20 ? 0x800 : 0x400 };
    } else if (f & 8) {
      this.speaker = { on: true, divisor: (Math.random() * 0x10000) | 0x2000 };
    }
  }

  // ---- robots (src/sim/robot.ts) -----------------------------------------------

  /** What side s's robot sees: itself, and every other ship present with its torpedoes. */
  robotView(s: number): RobotView {
    const i = this.ship(s);
    const body = (t: number) => ({ x: this.x(t), y: this.y(t), alive: this.alive(t) });
    const enemies = [];
    for (let o = 0; o < this.ships; o++) {
      if (o === s || !this.present[o]) continue;
      const e = this.ship(o);
      const torpedoes = [];
      for (let t = e + 1; t < e + 8; t++) torpedoes.push(body(t));
      enemies.push({ ship: body(e), torpedoes });
    }
    return { x: this.x(i), y: this.y(i), energy: this.energy[i], shield: this.shield[s], enemies };
  }

  /** The robot's Input for side s: even sides defend as the left robot, odd sides attack as the right. */
  robotInput(s: number): Input {
    return s % 2 === 0 ? defensive(this.robotView(s), this.rng) : offensive(this.robotView(s), this.rng);
  }
}
