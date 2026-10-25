// The screen drawn from the game's state each frame, for a world the host
// corrects (ticket, Decisions). The same sprites, XOR and places as the
// original's own drawing; only its leftovers between frames are not kept.

import type { Game } from './sim/game';
import { Screen } from './screen';
import {
  shipLeft, shipRight, torpedoLeft, torpedoRight, torpedoExplosion, planet as planetSheet, font,
} from './design/bitmaps';
import { BAR, PLANET_AT } from './design/tokens';

const hi = (v: number) => Math.floor(v / 65536);

export interface Labels { [side: number]: string | undefined }

export function drawWorld(g: Game, s: Screen, callsigns: Labels = {}): void {
  s.clear();
  for (const [x, y] of g.starPoints()) s.xorPixel(x, y);
  if (g.options.planet) s.blitOpaque(planetSheet, g.planetFrame, PLANET_AT.x, PLANET_AT.y);
  for (let side = 0; side < 2; side++) {
    const i = side * 8;
    if (g.state[i] > 0 && !(g.ctl[side] & 2)) {
      s.blit(side ? shipRight : shipLeft, ((g.angle[i] + 8) & 0xf0) >> 4, g.x(i), g.y(i));
    }
    for (let t = i + 1; t < i + 8; t++) {
      if (g.state[t] > 0) s.blit(side ? torpedoRight : torpedoLeft, ((g.angle[t] + 16) & 0xe0) >> 5, g.x(t), g.y(t));
      else if (g.state[t] < 0) {
        // The explosion's frames are XORed onto each other as the anim counter passes each 8.
        for (let k = 1; k <= g.anim[t] >> 3 && k < 8; k++) s.blit(torpedoExplosion, k, g.x(t), g.y(t));
      }
    }
    if (g.phaserShown[side]) {
      const p = g.phaserLine[side].length ? g.phaserLine[side] : g.phaserPixels(side);
      for (let n = 0; n < p.length; n += 2) s.xorPixel(p[n], p[n + 1]);
    }
    if (g.hyperStep[side]) for (let n = side * 32; n < side * 32 + 32; n++) s.xorPixel(hi(g.dx[n]), hi(g.dy[n]));
  }
  if (g.explosion) for (let n = 0; n < 90; n++) s.xorPixel(hi(g.dx[n]), hi(g.dy[n]));
  s.bar(g.shield[0], BAR.shieldY, true);
  s.bar(g.energy[0], BAR.energyY, true);
  s.bar(g.shield[1], BAR.shieldY, false);
  s.bar(g.energy[8], BAR.energyY, false);
  for (let n = 0; n < 4; n++) {
    if (!(g.labels & (1 << n))) continue;
    s.blit(font, n < 2 ? 0x53 : 0x45, n & 1 ? BAR.labelRightX : BAR.labelLeftX, n < 2 ? BAR.shieldY : BAR.energyY);
  }
  // Call signs last, so the bars never cover one.
  for (let side = 0; side < 2; side++) {
    const i = side * 8;
    const name = callsigns[side];
    if (name && g.state[i] > 0 && !(g.ctl[side] & 2)) s.text(name, g.x(i) - ((name.length - 1) * 10) / 2, g.y(i) + 14);
  }
}
