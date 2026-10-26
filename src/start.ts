// The start screen (design-system.md, Start screen): the title flying apart
// into its blocks and back as the 1985 menu's does, the controls, and PRESS
// ENTER TO START.

import { Screen } from './screen';
import { font } from './design/bitmaps';
import { titleBlocks } from './design/title';
import { Rng } from './sim/rng';
import { FLY_STEPS, TICKS_PER_STEP, HOLD_TICKS } from './menu';
import { ACTIONS, keyName, type Controls } from './controls';

// The player's own controls, as they have them, wrapped to the screen's width,
// then the keys the game keeps.
export const MORE = 'F10 CONTROLS  TAB SCORES  F8 SOUND  F9 CALL SIGN  ESC OFFLINE';
const WIDTH = 60;

export function controlLines(c: Controls): string[] {
  const items: string[] = c.mouseAim ? ['MOUSE AIMS'] : [];
  for (const { key, name } of ACTIONS) {
    const keys = c.bindings[key].filter(Boolean).map(keyName);
    if (keys.length) items.push(`${keys.join('/')} ${name}`);
  }
  const lines: string[] = [];
  for (const item of items) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 3 + item.length <= WIDTH) lines[last] += `   ${item}`;
    else lines.push(item);
  }
  return [...lines, MORE];
}
export const PROMPT = 'PRESS ENTER OR CLICK TO START';
/** The site-wide count of kills, by robots or people, in games a person is in (net/tally.ts). */
export const killsWorldwide = (n: number): string => `${n} ${n === 1 ? 'KILL' : 'KILLS'} WORLDWIDE`;
/** How long a game has lasted: M:SS, or H:MM:SS from an hour. */
export function gameClock(seconds: number): string {
  const t = Math.floor(seconds);
  const ss = String(t % 60).padStart(2, '0');
  const m = Math.floor(t / 60);
  return m < 60 ? `${m}:${ss}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}`;
}

const F = 65536;
const centred = (s: Screen, text: string, y: number) => s.text(text, 320 - (text.length * 10) / 2 + 5, y);

/** One round of the title: hold, fly out, fly back, in ticks. */
export const CYCLE_TICKS = HOLD_TICKS + 2 * FLY_STEPS * TICKS_PER_STEP;

export class StartScreen {
  readonly blocks = titleBlocks(['CITIZEN', 'WARS'], 12, 44);
  private vx: number[] = [];
  private vy: number[] = [];
  private ticks = 0;

  constructor(private rng = new Rng((Date.now() >>> 0) ^ 0x7177e)) {
    this.scatter();
  }

  /** Random velocities for each block, halved, as the 1985 menu sets them (`02AB:0A43`). */
  private scatter(): void {
    this.vx = this.blocks.map(() => this.rng.nextSigned() >> 1);
    this.vy = this.blocks.map(() => this.rng.nextSigned() >> 1);
  }

  /** Where each block is now: out 30 steps of 8 × its velocity, then back the same way. */
  positions(): [number, number][] {
    const t = this.ticks % CYCLE_TICKS;
    const fly = t - HOLD_TICKS;
    let steps = 0;
    if (fly > 0) {
      const done = Math.floor(fly / TICKS_PER_STEP);
      steps = done <= FLY_STEPS ? done : 2 * FLY_STEPS - done;
    }
    return this.blocks.map((b, n) => [
      b.x + Math.floor((this.vx[n] * 8 * steps) / F),
      b.y + Math.floor((this.vy[n] * 8 * steps) / F),
    ]);
  }

  step(n = 1): void {
    for (let k = 0; k < n; k++) {
      this.ticks++;
      if (this.ticks % CYCLE_TICKS === 0) this.scatter();
    }
  }

  draw(s: Screen, stars: [number, number][], controls: Controls, kills: number | null = null): void {
    s.clear();
    for (const [x, y] of stars) s.xorPixel(x, y);
    // Solid over the stars, so no star shows through a letter.
    this.positions().forEach(([x, y], n) => s.stamp(font, this.blocks[n].code, x, y));
    controlLines(controls).forEach((line, n) => centred(s, line, 108 + n * 10));
    if (!(this.ticks & 32)) centred(s, PROMPT, 176);
    if (kills !== null) centred(s, killsWorldwide(kills), 192);
  }
}
