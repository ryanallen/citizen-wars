// The screen drawn from the game's state each frame, for a world the host
// corrects (ticket, Decisions), at any number of ships: the field drawn at 1/k,
// sprites at their own size, lines one pixel (design-system.md, Zoom).

import type { Game } from './sim/game';
import { Screen } from './screen';
import {
  shipLeft, shipRight, torpedoLeft, torpedoRight, torpedoExplosion, planet as planetSheet,
} from './design/bitmaps';
import { BAR, SCREEN_W, SCREEN_H } from './design/tokens';
import { icons, ICON } from './design/icons';

const hi = (v: number) => Math.floor(v / 65536);

export interface SceneOptions {
  /** Call signs by side. */
  callsigns?: Record<number, string>;
  /** This player's side online: only its bars are drawn, in the left player's place. */
  me?: number | null;
  /** The system label, top left. */
  label?: string;
  /** The real sky, in screen pixels; else the DOS game's random stars. */
  sky?: [number, number][] | null;
  /** The scoreboard, while Tab is held. */
  scoreboard?: boolean;
}

export interface ScoreRow { side: number; name: string; kills: number; deaths: number }

/** A star: the planet sprite scaled by radius, drawn opaque. */
function drawStar(s: Screen, frame: number, cx: number, cy: number, scale: number): void {
  const rows = planetSheet.frames[frame];
  const size = Math.max(8, Math.round(32 * scale));
  const left = cx - (size >> 1);
  const top = cy - (size >> 1);
  for (let ty = 0; ty < size; ty++) {
    const row = rows[Math.min(31, Math.floor((ty * 32) / size))];
    const y = top + ty;
    if (y < 0 || y >= SCREEN_H) continue;
    for (let tx = 0; tx < size; tx++) {
      const x = left + tx;
      if (x < 0 || x >= SCREEN_W) continue;
      const sx = Math.min(31, Math.floor((tx * 32) / size));
      s.setPixel(x, y, (row & (1 << (31 - sx))) !== 0);
    }
  }
}

export function drawWorld(g: Game, s: Screen, o: SceneOptions = {}): void {
  const zx = SCREEN_W / g.w;
  const zy = SCREEN_H / g.h;
  const X = (x: number) => Math.round(x * zx);
  const Y = (y: number) => Math.round(y * zy);
  s.clear();
  for (const [x, y] of o.sky ?? g.starPoints()) s.xorPixel(x, y);
  if (g.options.planet) for (const b of g.bodies) drawStar(s, g.planetFrame, X(b.x + 1) - 1, Y(b.y + 1) - 1, b.scale);
  for (let side = 0; side < g.ships; side++) {
    const i = g.ship(side);
    if (g.state[i] > 0 && !(g.ctl[side] & 2)) s.blit(side % 2 ? shipRight : shipLeft, ((g.angle[i] + 8) & 0xf0) >> 4, X(g.x(i)), Y(g.y(i)));
    for (let t = i + 1; t < i + 8; t++) {
      if (g.state[t] > 0) s.blit(side % 2 ? torpedoRight : torpedoLeft, ((g.angle[t] + 16) & 0xe0) >> 5, X(g.x(t)), Y(g.y(t)));
      else if (g.state[t] < 0) {
        // The explosion's frames are XORed onto each other as the anim counter passes each 8.
        for (let k = 1; k <= g.anim[t] >> 3 && k < 8; k++) s.blit(torpedoExplosion, k, X(g.x(t)), Y(g.y(t)));
      }
    }
    if (g.phaserShown[side]) {
      const p = g.phaserLine[side].length ? g.phaserLine[side] : g.phaserPixels(side);
      const seen = new Set<number>();
      for (let n = 0; n < p.length; n += 2) {
        const k = Y(p[n + 1]) * SCREEN_W + X(p[n]);
        if (seen.has(k)) continue;
        seen.add(k);
        s.xorPixel(X(p[n]), Y(p[n + 1]));
      }
    }
    if (g.hyperStep[side]) for (let n = side * 32; n < side * 32 + 32; n++) s.xorPixel(X(hi(g.hx[n])), Y(hi(g.hy[n])));
    if (g.exploding[side] >= 0) for (let n = side * 90; n < side * 90 + 90; n++) s.xorPixel(X(hi(g.ex[n])), Y(hi(g.ey[n])));
  }
  const me = o.me ?? null;
  if (me === null) {
    s.bar(g.shield[0], BAR.shieldY, true);
    s.bar(g.energy[0], BAR.energyY, true);
    s.bar(g.shield[1], BAR.shieldY, false);
    s.bar(g.energy[8], BAR.energyY, false);
    for (let n = 0; n < 4; n++) {
      if (!(g.labels & (1 << n))) continue;
      s.blit(icons, n < 2 ? ICON.shield : ICON.energy, n & 1 ? BAR.labelRightX : BAR.labelLeftX, n < 2 ? BAR.shieldY : BAR.energyY);
    }
  } else if (g.present[me]) {
    s.bar(g.shield[me], BAR.shieldY, true);
    s.bar(g.energy[g.ship(me)], BAR.energyY, true);
    // The shield icon blinks below 16 shield, every 32 ticks, as the original's does.
    const blink = g.shield[me] < 16 && g.tick & 0x20;
    if (!blink) s.blit(icons, ICON.shield, BAR.labelLeftX, BAR.shieldY);
    s.blit(icons, ICON.energy, BAR.labelLeftX, BAR.energyY);
  }
  // Call signs last, so the bars never cover one.
  for (let side = 0; side < g.ships; side++) {
    const i = g.ship(side);
    const name = me !== null && g.options.robot[side] ? BOT_NAME : o.callsigns?.[side];
    if (name && g.state[i] > 0 && !(g.ctl[side] & 2)) s.text(name, X(g.x(i)) - ((name.length - 1) * 10) / 2, Y(g.y(i)) + 14);
  }
  if (o.label) s.text(o.label, 10, 8);
  if (o.scoreboard) drawScoreboard(g, s, o);
  else if (me !== null) drawScores(g, s, o);
}

/** A robot flies under BOT, so a person can tell it from a player at a glance. */
export const BOT_NAME = 'BOT';

/** How many ships the always-on scores list, top right; Tab shows them all. */
const SCORE_LINES = 4;

/** Every ship present, most kills first, named by call sign or as a robot. */
export function scoreRows(g: Game, o: SceneOptions): ScoreRow[] {
  const rows = [];
  for (let side = 0; side < g.ships; side++) {
    if (!g.present[side]) continue;
    const name = g.options.robot[side] ? BOT_NAME : o.callsigns?.[side] ?? `SHIP ${side + 1}`;
    rows.push({ side, name, kills: g.kills[side], deaths: g.deaths[side] });
  }
  return rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
}

/** The scores, always shown online: top right, one ship a line, most kills first (design-system.md, Scores). */
function drawScores(g: Game, s: Screen, o: SceneOptions): void {
  scoreRows(g, o).slice(0, SCORE_LINES).forEach((r, n) => {
    const line = `${r.side === o.me ? '>' : ' '}${r.name.padEnd(8)} ${String(r.kills).padStart(3)}`;
    s.text(line, 630 - (line.length - 1) * 10, 8 + 8 * n);
  });
}

/** The scoreboard (design-system.md, Scoreboard). */
function drawScoreboard(g: Game, s: Screen, o: SceneOptions): void {
  const rows = scoreRows(g, o);
  const width = 26;
  const pad = (v: string | number, n: number) => String(v).padStart(n);
  const lines = [' CALL SIGN  KILLS  DEATHS ', ...rows.map((r) => `${r.side === o.me ? '>' : ' '}${r.name.padEnd(9)} ${pad(r.kills, 6)} ${pad(r.deaths, 7)} `)];
  drawBox(s, lines, width);
}

/** Lines in a box of the font's box pieces, centred on the screen, cleared behind. */
export function drawBox(s: Screen, lines: string[], width: number): void {
  const left = 320 - (width * 10) / 2 + 5;
  const top = 100 - ((lines.length + 2) * 8) / 2;
  const edge = '\x19' + '\x1d'.repeat(width) + '\x16';
  const bottom = '\x18' + '\x1d'.repeat(width) + '\x17';
  // Clear the box first so the field does not show through.
  for (let y = top - 4; y < top + (lines.length + 2) * 8 - 4; y++) for (let x = left - 15; x < left + (width + 1) * 10 - 5; x++) if (x >= 0 && x < SCREEN_W && y >= 0 && y < SCREEN_H) s.setPixel(x, y, false);
  s.text(edge, left - 10, top);
  lines.forEach((l, n) => s.text('\x15' + l.padEnd(width) + '\x15', left - 10, top + 8 * (n + 1)));
  s.text(bottom, left - 10, top + 8 * (lines.length + 1));
}
