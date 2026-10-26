// The menu's attract loop (design-system.md, Spacewar Live menu): the title with
// the credit and win counts, then GAME INSTRUCTIONS, then GAME KEYS, round again.

import { Screen } from './screen';
import { Rng } from './sim/rng';
import { font, shipLeft, shipRight, planet as planetSheet } from './design/bitmaps';
import { MENU_PLANET_AT } from './design/tokens';
import { titleBlocks, type Block } from './design/title';
import { INSTRUCTIONS_PAGE, KEYS_PAGE, MENU_BAR, BAR_MARKS, BAR_MARK, type Page } from './design/pages';

const F = 65536;
export const FLY_STEPS = 30;
export const TICKS_PER_STEP = 4;
export const HOLD_TICKS = 291;
export const PAGE_TICKS = 582;

type Phase =
  | { kind: 'title-hold'; ticks: number; next: 'fly' | 'page' }
  | { kind: 'fly'; ticks: number; step: number; back: boolean }
  | { kind: 'page'; ticks: number; page: Page };

export interface Toggles { robotLeft: boolean; robotRight: boolean; planet: boolean; gravity: boolean; pause: boolean }

export class Menu {
  private blocks: Block[] = titleBlocks();
  private bx: number[] = [];
  private by: number[] = [];
  private bvx: number[] = [];
  private bvy: number[] = [];
  private phase: Phase = { kind: 'title-hold', ticks: 0, next: 'fly' };
  private tick = 0;
  private planetFrame = 0;
  /** The GAME KEYS page, with the keys as the player has them (controls.ts). */
  keysPage: Page = KEYS_PAGE;

  constructor(private screen: Screen, private rng: Rng, private wins: () => [number, number]) {}

  /** Clear the screen, draw stars, the bar and its marks, and start on the title (`02AB:0940`). */
  open(toggles: Toggles): void {
    const s = this.screen;
    s.clear();
    for (let n = 0; n < 512; n++) s.xorPixel(this.rng.x(), this.rng.y());
    for (const [x, y, t] of MENU_BAR) s.text(t, x, y);
    if (toggles.robotLeft) this.mark('robotLeft');
    if (toggles.robotRight) this.mark('robotRight');
    if (toggles.planet) this.mark('planet');
    if (toggles.gravity) this.mark('gravity');
    if (toggles.pause) this.mark('pause');
    this.showTitle();
  }

  /** XOR a toggle's marker on the bar, as each F-key does. */
  mark(which: keyof typeof BAR_MARKS): void {
    this.screen.text(BAR_MARK, BAR_MARKS[which], 192);
  }

  private titleText(): void {
    const s = this.screen;
    const [l, r] = this.wins();
    s.blit(shipLeft, 8, 160, 176);
    let pen = s.text(' = ', 170, 176);
    s.text(String(l), pen.x, pen.y);
    s.blit(shipRight, 8, 420, 176);
    pen = s.text(' = ', 430, 176);
    s.text(String(r), pen.x, pen.y);
  }

  private drawBlocks(): void {
    this.blocks.forEach((b, n) => this.screen.blit(font, b.code, Math.floor(this.bx[n] / F), Math.floor(this.by[n] / F)));
  }

  private showTitle(): void {
    this.bx = this.blocks.map((b) => b.x * F);
    this.by = this.blocks.map((b) => b.y * F);
    this.titleText();
    this.drawBlocks();
    this.phase = { kind: 'title-hold', ticks: 0, next: 'fly' };
  }

  private drawPage(page: Page): void {
    for (const [x, y, t] of page) this.screen.text(t, x, y);
  }

  /** F1: skip to the next page now. */
  next(): void {
    const p = this.phase;
    if (p.kind === 'page') {
      this.drawPage(p.page);
      this.advancePage(p.page);
    } else {
      if (p.kind === 'fly') {
        this.drawBlocks();
        this.bx = this.blocks.map((b) => b.x * F);
        this.by = this.blocks.map((b) => b.y * F);
        this.drawBlocks();
      }
      this.leaveTitle();
    }
  }

  private leaveTitle(): void {
    this.titleText();
    this.drawBlocks();
    this.drawPage(INSTRUCTIONS_PAGE);
    this.phase = { kind: 'page', ticks: 0, page: INSTRUCTIONS_PAGE };
  }

  private advancePage(page: Page): void {
    if (page === INSTRUCTIONS_PAGE) {
      this.drawPage(this.keysPage);
      this.phase = { kind: 'page', ticks: 0, page: this.keysPage };
    } else {
      this.showTitle();
    }
  }

  /** One timer tick on the menu: the corner planet every 16 ticks, then the attract loop. */
  step(): void {
    this.tick = (this.tick + 1) & 255;
    if ((this.tick & 15) === 0) {
      this.planetFrame = (this.planetFrame + 1) & 15;
      this.screen.blitOpaque(planetSheet, this.planetFrame, MENU_PLANET_AT.x, MENU_PLANET_AT.y);
    }
    const p = this.phase;
    p.ticks++;
    if (p.kind === 'title-hold') {
      if (p.ticks < HOLD_TICKS) return;
      if (p.next === 'page') return this.leaveTitle();
      // Scatter: random velocities, halved, as `02AB:0A43` sets them.
      this.bvx = this.blocks.map(() => this.rng.nextSigned() >> 1);
      this.bvy = this.blocks.map(() => this.rng.nextSigned() >> 1);
      this.phase = { kind: 'fly', ticks: 0, step: 0, back: false };
    } else if (p.kind === 'fly') {
      if (p.ticks % TICKS_PER_STEP) return;
      this.drawBlocks();
      for (let n = 0; n < this.blocks.length; n++) {
        this.bx[n] += this.bvx[n] * 8;
        this.by[n] += this.bvy[n] * 8;
      }
      this.drawBlocks();
      if (++p.step < FLY_STEPS) return;
      if (!p.back) {
        this.bvx = this.bvx.map((v) => -v);
        this.bvy = this.bvy.map((v) => -v);
        this.phase = { kind: 'fly', ticks: 0, step: 0, back: true };
      } else {
        this.phase = { kind: 'title-hold', ticks: 0, next: 'page' };
      }
    } else if (p.ticks >= PAGE_TICKS) {
      this.drawPage(p.page);
      this.advancePage(p.page);
    }
  }
}
