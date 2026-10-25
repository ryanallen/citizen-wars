// The DOS game's play, routine by routine from citizenwars/docs/original.md.
// Positions and velocities are 16.16 fixed point kept as whole numbers
// (value * 65536), so every sum is the code's own integer sum.

import { Screen } from '../screen';
import { Rng } from './rng';
import { TAN, sin, cos } from './tables';
import {
  shipLeft, shipRight, torpedoLeft, torpedoRight, torpedoExplosion, planet as planetSheet, font,
} from '../design/bitmaps';
import { BAR, PLANET_AT } from '../design/tokens';

const F = 65536;
const SLOTS = 16;
/** How many main-loop passes run each tick (ticket, Decisions). */
export const PASSES_PER_TICK = 2;
/** Ship explosion: 128 frames; one every 3 ticks and a 60-tick hold make the 6.1 s measured in DOSBox-X. */
export const EXPLOSION_FRAMES = 128;
export const EXPLOSION_TICKS_PER_FRAME = 3;
export const EXPLOSION_HOLD_TICKS = 60;

/** Key indexes, in the order the code walks them (original.md, Keys). */
export const enum Key { CW = 0, CCW = 1, Shield = 2, Weapon = 3, Phaser = 4, Photon = 5, Impulse = 6, Cloak = 7, Hyper = 8 }

const hi = (v: number) => Math.floor(v / F);
const lo = (v: number) => v - hi(v) * F;
const byte = (v: number) => ((v % 256) + 256) % 256;
const sbyte = (v: number) => { const b = byte(v); return b >= 128 ? b - 256 : b; };

export interface Options { planet: boolean; gravity: boolean; robot: [boolean, boolean] }

export interface Speaker { on: boolean; divisor: number }

export class Game {
  readonly screen: Screen;
  readonly rng: Rng;
  options: Options = { planet: false, gravity: false, robot: [false, false] };
  paused = false;
  soundOn = false;
  wins: [number, number] = [0, 0];
  /** Each player's held keys, bit n = Key n. */
  keys: [number, number] = [0, 0];

  tick = 0;
  planetFrame = 0;

  // Object slots: 0 left ship, 1-7 its torpedoes, 8 right ship, 9-15 its torpedoes.
  px = new Array<number>(SLOTS).fill(0);
  py = new Array<number>(SLOTS).fill(0);
  vx = new Array<number>(SLOTS).fill(0);
  vy = new Array<number>(SLOTS).fill(0);
  oldx = new Array<number>(SLOTS).fill(0);
  oldy = new Array<number>(SLOTS).fill(0);
  state = new Array<number>(SLOTS).fill(0);
  angle = new Array<number>(SLOTS).fill(0);
  oldangle = new Array<number>(SLOTS).fill(0);
  redraw = new Array<boolean>(SLOTS).fill(false);
  drawn = new Array<boolean>(SLOTS).fill(false);
  energy = new Array<number>(SLOTS).fill(0);
  anim = new Array<number>(SLOTS).fill(0);
  spin: [number, number] = [0, 0];
  ctl: [number, number] = [0, 0];
  latch: [number, number] = [0, 0];
  shield: [number, number] = [0, 0];
  phaserTimer: [number, number] = [-1, -1];
  phaserLine: [number[], number[]] = [[], []];
  labels = 0;

  // Particles: hyperspace clouds use 0-31 (left) and 32-63 (right); a ship explosion uses 0-89.
  dx = new Array<number>(90).fill(0);
  dy = new Array<number>(90).fill(0);
  dvx = new Array<number>(90).fill(0);
  dvy = new Array<number>(90).fill(0);
  hyperStep: [number, number] = [0, 0];

  // Sound, as `02AB:27C0` keeps it.
  soundFlags = 0;
  soundCount = 0;
  speaker: Speaker = { on: false, divisor: 0 };

  /** A ship explosion under way: which ship, and ticks since it began. */
  explosion: { ship: 0 | 1; ticks: number } | null = null;

  constructor(seed: number, screen = new Screen()) {
    this.screen = screen;
    this.rng = new Rng(seed);
  }

  // ---- slots -----------------------------------------------------------------

  x(i: number): number { return hi(this.px[i]); }
  y(i: number): number { return hi(this.py[i]); }
  alive(i: number): boolean { return this.state[i] > 0; }
  private ship(side: number): number { return side * 8; }

  /** Start a round (`02AB:1F29`): the ships at their start points, a new starfield. */
  startRound(): void {
    this.px.fill(0); this.py.fill(0); this.vx.fill(0); this.vy.fill(0);
    this.oldx.fill(0); this.oldy.fill(0); this.state.fill(0); this.angle.fill(0);
    this.oldangle.fill(0); this.redraw.fill(false); this.drawn.fill(false);
    this.energy.fill(0); this.anim.fill(0);
    this.spin = [0, 0]; this.ctl = [0, 0]; this.latch = [0, 0];
    this.phaserTimer = [-1, -1]; this.phaserLine = [[], []];
    // A hyperspace cloud left over from the last round would teleport a ship; the original keeps it, this does not.
    this.hyperStep = [0, 0];
    const starts = [[160, 46, 0], [480, 138, 128]];
    for (let s = 0; s < 2; s++) {
      const i = this.ship(s);
      const [x, y, a] = starts[s];
      this.px[i] = x * F; this.py[i] = y * F; this.oldx[i] = x; this.oldy[i] = y;
      this.angle[i] = a; this.oldangle[i] = a; this.state[i] = 1;
      this.energy[i] = 127; this.shield[s] = 31;
    }
    this.screen.clear();
    this.stars();
    this.drawShip(0, true); this.drawShip(1, true);
    this.labels = 0;
    for (let n = 0; n < 4; n++) this.toggleLabel(n);
    this.soundFlags = 0;
    this.explosion = null;
  }

  /** 512 random pixels in [8, 632) x [8, 192), XOR (`02AB:2932`). */
  stars(): void {
    for (let n = 0; n < 512; n++) {
      const x = this.rng.x();
      const y = this.rng.y();
      this.screen.xorPixel(x, y);
    }
  }

  // ---- drawing, where and when the original draws ----------------------------

  private drawShip(side: number, show: boolean): void {
    const i = this.ship(side);
    if (this.drawn[i] === show) return;
    const frame = ((this.oldangle[i] + 8) & 0xf0) >> 4;
    this.screen.blit(side ? shipRight : shipLeft, frame, this.oldx[i], this.oldy[i]);
    this.drawn[i] = show;
  }

  private toggleTorpedo(i: number): void {
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

  /** The S and E labels: bit 0 left S, 1 right S, 2 left E, 3 right E (`02AB:1BED`). */
  toggleLabel(n: number): void {
    const x = n & 1 ? BAR.labelRightX : BAR.labelLeftX;
    const y = n < 2 ? BAR.shieldY : BAR.energyY;
    this.screen.blit(font, n < 2 ? 0x53 : 0x45, x, y);
    this.labels ^= 1 << n;
  }

  private bars(): void {
    this.screen.bar(this.shield[0], BAR.shieldY, true);
    this.screen.bar(this.energy[0], BAR.energyY, true);
    this.screen.bar(this.shield[1], BAR.shieldY, false);
    this.screen.bar(this.energy[8], BAR.energyY, false);
  }

  // ---- one tick: the timer interrupt (`02AB:233D`) ---------------------------

  step(): 'play' | 'round-over' {
    if (this.explosion) return this.explosionStep();
    if (!this.paused) {
      for (let n = 0; n < PASSES_PER_TICK && !this.explosion; n++) this.pass();
    }
    if (this.explosion) return 'play';
    this.timer();
    return 'play';
  }

  timer(): void {
    this.tick = byte(this.tick + 1);
    if (!this.paused) {
      for (let s = 0; s < 2; s++) this.shipTick(s);
      for (let i = 0; i < SLOTS; i++) {
        if (!this.alive(i)) continue;
        this.move(i);
        if (this.options.gravity) this.gravity(i);
      }
      if ((this.tick & 0x1f) === 0) this.lowShield();
      if (this.tick === 0) {
        for (const i of [0, 8]) {
          const e = this.energy[i];
          if (e !== 0 && e + 1 <= 127) this.energy[i] = sbyte(e + 1);
        }
      }
      if ((this.tick & 0xf) === 0) {
        for (let i = 1; i < SLOTS; i++) {
          if (i === 8 || !this.alive(i)) continue;
          if (this.energy[i] !== 0) this.energy[i]--;
        }
      }
      for (let s = 0; s < 2; s++) {
        const t = this.phaserTimer[s];
        if (t >= 0 && t !== 0x14) this.phaserTimer[s] = t - 1;
      }
      this.sound();
      for (let s = 0; s < 2; s++) if (this.hyperStep[s]) this.hyperTravel(s);
    }
    if ((this.tick & 0xf) === 0 && this.options.planet) {
      this.planetFrame = (this.planetFrame + 1) & 15;
      this.screen.blitOpaque(planetSheet, this.planetFrame, PLANET_AT.x, PLANET_AT.y);
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

  /** `02AB:22C6`: move, wrapping in x [8, 632) and y [8, 192). */
  move(i: number): void {
    let p = this.px[i] + this.vx[i];
    let x = hi(p);
    const fx = p - x * F;
    if (x < 0) x += 640;
    if (x < 8) x += 624; else if (x >= 632) x -= 624;
    this.px[i] = x * F + fx;
    if (x !== this.oldx[i]) this.redraw[i] = true;
    p = this.py[i] + this.vy[i];
    let y = hi(p);
    const fy = p - y * F;
    if (y < 0) y += 200;
    if (y < 8) y += 184; else if (y >= 192) y -= 184;
    this.py[i] = y * F + fy;
    if (y !== this.oldy[i]) this.redraw[i] = true;
  }

  /** `02AB:1E30`: velocity -= 8 * (position - planet) / 65536 a tick, a spring. */
  gravity(i: number): void {
    this.vx[i] -= 8 * (this.x(i) - PLANET_AT.x);
    this.vy[i] -= 8 * (this.y(i) - PLANET_AT.y);
  }

  /** Every 32 ticks: the warning tone and the blinking S below 16 shield (`02AB:24A4`). */
  private lowShield(): void {
    this.soundFlags &= ~1;
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
    for (let s = 0; s < 2; s++) {
      const i = this.ship(s);
      if (this.phaserTimer[s] === 0x14) {
        this.xorLine(this.phaserLine[s]);
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
    if (this.shield[0] < 0) this.die(0);
    else if (this.shield[1] < 0) this.die(1);
  }

  // ---- keys ------------------------------------------------------------------

  private input(s: number): void {
    if (this.options.robot[s]) {
      if (s === 0) this.robotDefensive(); else this.robotOffensive();
      return;
    }
    this.spin[s] = 0;
    for (let k = 8; k >= 0; k--) {
      if (this.keys[s] & (1 << k)) this.press(s, k); else this.release(s, k);
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
    let x = hi(dx * 8) + this.x(i);
    if (x < 0) x += 640;
    if (x < 8) x += 624;
    if (x >= 632) x -= 624;
    let y = hi(dy * 8) + this.y(i);
    if (y < 0) y += 200;
    if (y < 8) y += 184;
    if (y >= 192) y -= 184;
    // The fraction of a reused slot is not reset, as in the original.
    this.px[t] = x * F + lo(this.px[t]);
    this.py[t] = y * F + lo(this.py[t]);
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
    for (let i = 0; i < SLOTS; i++) {
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
      this.screen.blit(torpedoExplosion, (this.anim[i] & 0x38) >> 3, this.x(i), this.y(i));
    }
  }

  private destroy(i: number): void {
    this.toggleTorpedo(i);
    this.redraw[i] = false;
    this.state[i] = -1;
  }

  // ---- collisions (`02AB:18A0`) ------------------------------------------------

  private near(a: number, b: number, box: number): boolean {
    if (!this.alive(a) || !this.alive(b)) return false;
    return Math.abs(this.y(a) - this.y(b)) < box && Math.abs(this.x(a) - this.x(b)) < box;
  }

  private collisions(): void {
    if (this.near(0, 8, 16)) this.bounce();
    const hits: [number, number, number][] = [[0, 9, 16], [0, 1, 8], [8, 1, 8], [8, 9, 16]];
    for (const [ship, from, to] of hits) {
      for (let t = from; t < to; t++) {
        if (!this.near(ship, t, 8)) continue;
        this.destroy(t);
        this.shield[ship >> 3] = sbyte(this.shield[ship >> 3] - 4);
      }
    }
    for (let a = 1; a < 8; a++) {
      for (let b = 9; b < 16; b++) {
        if (!this.near(a, b, 6)) continue;
        this.destroy(b);
        this.destroy(a);
      }
    }
    if (!this.options.planet) return;
    for (let i = 0; i < SLOTS; i++) {
      if (!this.alive(i)) continue;
      if (Math.abs(this.x(i) - PLANET_AT.x) >= 16 || Math.abs(this.y(i) - PLANET_AT.y) >= 16) continue;
      if (i === 0 || i === 8) this.shield[i >> 3] = sbyte(this.shield[i >> 3] - 2);
      else this.destroy(i);
    }
  }

  /** Ships touching: swap velocities halved, push 2 px apart, no damage. */
  private bounce(): void {
    const [lvx, lvy, rvx, rvy] = [this.vx[0], this.vy[0], this.vx[8], this.vy[8]];
    this.vx[0] = Math.floor(rvx / 2); this.vy[0] = Math.floor(rvy / 2);
    this.vx[8] = Math.floor(lvx / 2); this.vy[8] = Math.floor(lvy / 2);
    const apart = (a: number, b: number, size: number): [number, number] => {
      if (b - a >= 0) { a -= 2; b += 2; } else { a += 2; b -= 2; }
      if (a < 0) a += size; else if (a >= size) a -= size;
      if (b < 0) b += size; else if (b >= size) b -= size;
      return [a, b];
    };
    const [lx, rx] = apart(this.x(0), this.x(8), 640);
    const [ly, ry] = apart(this.y(0), this.y(8), 200);
    this.px[0] = lx * F + lo(this.px[0]); this.px[8] = rx * F + lo(this.px[8]);
    this.py[0] = ly * F + lo(this.py[0]); this.py[8] = ry * F + lo(this.py[8]);
    this.redraw[0] = true; this.redraw[8] = true;
  }

  // ---- phasers (`02AB:2006`, `02AB:20A6`) --------------------------------------

  private firePhaser(s: number): void {
    const i = this.ship(s);
    this.soundCount = 0;
    this.soundFlags |= 2;
    this.phaserLine[s] = this.traceLine(this.angle[i], this.x(i), this.y(i), true);
    this.xorLine(this.phaserLine[s]);
  }

  private xorLine(pixels: number[]): void {
    for (let n = 0; n < pixels.length; n += 2) this.screen.xorPixel(pixels[n], pixels[n + 1]);
  }

  /** The phaser's stepped line, pixels from step 9 to 96, testing hits every 8th step. */
  traceLine(angle: number, x: number, y: number, hits: boolean): number[] {
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
    let ax = 0;
    let ay = 0;
    const out: number[] = [];
    let steps = 0;
    for (;;) {
      let moved = 0;
      ax += ix;
      if (ax > 0xffff) { ax &= 0xffff; moved++; x = left ? (x === 0 ? 639 : x - 1) : (x + 1 >= 640 ? 0 : x + 1); }
      ay += iy;
      if (ay > 0xffff) { ay &= 0xffff; moved++; y = up ? (y === 0 ? 199 : y - 1) : (y + 1 >= 200 ? 0 : y + 1); }
      if (!moved) continue;
      steps++;
      if (steps < 9) continue;
      out.push(x, y);
      if (hits && (steps & 7) === 0 && this.phaserHit(x, y)) break;
      if (steps >= 0x60) break;
    }
    return out;
  }

  /** `02AB:222E`: a ship inside 8 px loses 2 shield, a torpedo is destroyed, the planet stops it. */
  private phaserHit(x: number, y: number): boolean {
    for (let i = 0; i < SLOTS; i++) {
      if (!this.alive(i)) continue;
      if (Math.abs(y - this.y(i)) >= 8 || Math.abs(x - this.x(i)) >= 8) continue;
      if (i === 0 || i === 8) this.shield[i >> 3] = sbyte(this.shield[i >> 3] - 2);
      else this.destroy(i);
      return true;
    }
    return this.options.planet && Math.abs(y - PLANET_AT.y) < 16 && Math.abs(x - PLANET_AT.x) < 16;
  }

  // ---- hyperspace (`02AB:06F6`) ----------------------------------------------

  private hyperspace(s: number): void {
    const i = this.ship(s);
    this.state[i] = 0;
    this.redraw[i] = false;
    const nx = this.rng.x();
    const ny = this.rng.y();
    this.px[i] = nx * F;
    this.py[i] = ny * F;
    this.vx[i] = (nx - this.oldx[i]) * 1024;
    this.vy[i] = (ny - this.oldy[i]) * 1024;
    const base = s * 32;
    for (let n = base; n < base + 32; n++) {
      this.dx[n] = this.oldx[i] * F;
      this.dy[n] = this.oldy[i] * F;
      this.dvx[n] = this.rng.nextSigned();
      this.dvy[n] = this.rng.nextSigned();
      this.screen.xorPixel(this.oldx[i], this.oldy[i]);
    }
    this.hyperStep[s] = 1;
    this.soundFlags |= 0x10;
  }

  /** The cloud's travel, 32 ticks out and 32 back while it carries the ship (`02AB:2587`). */
  private hyperTravel(s: number): void {
    const i = this.ship(s);
    const step = this.hyperStep[s];
    this.hyperStep[s] = step + 1;
    const base = s * 32;
    if (step === 0x40) {
      for (let n = base; n < base + 32; n++) this.screen.xorPixel(hi(this.dx[n]), hi(this.dy[n]));
      this.hyperStep[s] = 0;
      this.state[i] = 1;
      this.redraw[i] = true;
      const x = hi(this.dx[base]);
      const y = hi(this.dy[base]);
      this.px[i] = x * F; this.py[i] = y * F;
      this.oldx[i] = x; this.oldy[i] = y;
      this.vx[i] = 0; this.vy[i] = 0;
      this.soundFlags &= ~0x10;
      return;
    }
    if (step === 0x20) {
      for (let n = base; n < base + 32; n++) { this.dvx[n] = -this.dvx[n]; this.dvy[n] = -this.dvy[n]; }
    }
    for (let n = base; n < base + 32; n++) {
      this.screen.xorPixel(hi(this.dx[n]), hi(this.dy[n]));
      this.dx[n] = this.wrapFixed(this.dx[n] + this.dvx[n] * 2 + this.vx[i], 640);
      this.dy[n] = this.wrapFixed(this.dy[n] + this.dvy[n] * 4 + this.vy[i], 200);
      this.screen.xorPixel(hi(this.dx[n]), hi(this.dy[n]));
    }
  }

  private wrapFixed(p: number, size: number): number {
    let w = hi(p);
    const f = p - w * F;
    if (w < 0) w += size; else if (w >= size) w -= size;
    return w * F + f;
  }

  // ---- ship death (`02AB:07BC`, `02AB:07FC`) -----------------------------------

  private die(s: 0 | 1): void {
    const i = this.ship(s);
    this.drawShip(s, false);
    this.state[i] = 0;
    this.spin[s] = 0;
    this.ctl[s] = 0;
    this.wins[1 - s]++;
    this.soundFlags = 0x80;
    for (let n = 0; n < 90; n++) {
      this.dx[n] = this.oldx[i] * F;
      this.dy[n] = this.oldy[i] * F;
      this.dvx[n] = this.rng.nextSigned();
      this.dvy[n] = this.rng.nextSigned();
      this.screen.xorPixel(this.oldx[i], this.oldy[i]);
    }
    this.explosion = { ship: s, ticks: 0 };
  }

  private explosionStep(): 'play' | 'round-over' {
    const e = this.explosion!;
    e.ticks++;
    const frames = EXPLOSION_FRAMES * EXPLOSION_TICKS_PER_FRAME;
    if (e.ticks <= frames && e.ticks % EXPLOSION_TICKS_PER_FRAME === 0) {
      for (let n = 0; n < 90; n++) {
        this.screen.xorPixel(hi(this.dx[n]), hi(this.dy[n]));
        this.dx[n] = this.wrapFixed(this.dx[n] + this.dvx[n], 640);
        this.dy[n] = this.wrapFixed(this.dy[n] + this.dvy[n], 200);
        this.screen.xorPixel(hi(this.dx[n]), hi(this.dy[n]));
      }
      if (e.ticks === frames) {
        for (let n = 0; n < 90; n++) this.screen.xorPixel(hi(this.dx[n]), hi(this.dy[n]));
      }
    }
    if (e.ticks >= frames + EXPLOSION_HOLD_TICKS) {
      this.explosion = null;
      this.soundFlags = 0;
      return 'round-over';
    }
    return 'play';
  }

  /** How dense the explosion's clicks are now, 0..1: a click every (frame+1) particles (`02AB:080A`). */
  explosionClickRate(): number {
    if (!this.explosion) return 0;
    const frame = Math.floor(this.explosion.ticks / EXPLOSION_TICKS_PER_FRAME);
    return frame >= EXPLOSION_FRAMES ? 0 : 1 / (frame + 1);
  }

  // ---- sound (`02AB:27C0`) -----------------------------------------------------

  private sound(): void {
    const off = () => { this.soundFlags = 0; this.soundCount = 0; this.speaker = { on: false, divisor: 0 }; };
    if (!this.soundOn) return off();
    const f = this.soundFlags;
    if (f & 0x80) return;
    if (!f) return off();
    if (f & 0x10) {
      this.speaker = { on: true, divisor: ((this.hyperStep[0] + this.hyperStep[1]) & 255) * 256 };
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
      this.speaker = { on: true, divisor: this.rng.next() | 0x2000 };
    }
  }

  // ---- robots ------------------------------------------------------------------

  /** Aim from (dx, dy) by octant with the tangent table (`02AB:03E8`). */
  static aim(dx: number, dy: number): number {
    let flags = 0;
    if (dx < 0) { dx = -dx; flags |= 1; }
    if (dy < 0) { dy = -dy; flags ^= 2; }
    let a: number;
    const index = (v: number) => { for (let n = 31; n >= 0; n--) if (v >= TAN[n]) return n; return 0; };
    if (dy === dx) a = 0x20;
    else if (dy < dx) a = index(Math.floor((dy * F) / dx) >> 1);
    else a = 0x40 - index(Math.floor((dx * F) / dy) >> 1);
    let base = 0;
    if (flags & 1) { base = 0x80; a = -a; }
    if (flags & 2) a = -a;
    return byte(base + a);
  }

  private balance(s: number): void {
    const i = this.ship(s);
    if (this.shield[s] === this.energy[i]) return;
    if (this.shield[s] < this.energy[i]) this.press(s, Key.Shield); else this.press(s, Key.Weapon);
  }

  /** The left robot (`02AB:038E`). */
  robotDefensive(): void {
    this.balance(0);
    if (this.energy[0] === 0) { this.release(0, Key.Impulse); return; }
    for (let t = 8; t < 16; t++) {
      if (!this.alive(t)) continue;
      if (Math.abs(this.y(0) - this.y(t)) >= 0x60 || Math.abs(this.x(0) - this.x(t)) >= 0x60) continue;
      const a = Game.aim(this.x(t) - this.x(0), this.y(t) - this.y(0));
      this.spin[0] = 0;
      if (a !== this.angle[0]) { this.angle[0] = a; this.redraw[0] = true; }
      this.press(0, Key.Phaser);
      break;
    }
    if ((this.rng.next() & 255) < 0x10) this.press(0, Key.Impulse); else this.release(0, Key.Impulse);
    if ((this.rng.next() & 0x3ff) === 0) this.press(0, Key.Hyper); else this.release(0, Key.Hyper);
  }

  /** The right robot (`02AB:05E5`). */
  robotOffensive(): void {
    const dx = this.x(0) - this.x(8);
    const dy = this.y(0) - this.y(8);
    const close = (Math.abs(dx) < 0x60 ? 1 : 0) + (Math.abs(dy) < 0x60 ? 1 : 0);
    const a = Game.aim(dx, dy);
    this.spin[1] = 0;
    if (a !== this.angle[8]) { this.angle[8] = a; this.redraw[8] = true; }
    this.balance(1);
    if (this.energy[8] === 0) { this.release(1, Key.Impulse); this.release(1, Key.Photon); return; }
    if ((this.rng.next() & 255) < 0x10) this.press(1, Key.Impulse); else this.release(1, Key.Impulse);
    if ((this.rng.next() & 255) >= 8) {
      this.release(1, Key.Photon);
    } else if (close === 2) {
      this.release(1, Key.Photon);
      this.press(1, Key.Phaser);
    } else {
      this.press(1, Key.Photon);
    }
    if ((this.rng.next() & 0x3ff) === 0) this.press(1, Key.Hyper); else this.release(1, Key.Hyper);
  }
}


