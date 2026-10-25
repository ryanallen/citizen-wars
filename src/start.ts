// The start screen (design-system.md, Start screen): the title, the controls,
// and PRESS ENTER TO START.

import { Screen } from './screen';
import { font } from './design/bitmaps';
import { titleBlocks } from './design/title';

export const CONTROLS = [
  'Q PHASERS     W CLOAK       E PHOTON TORPEDO',
  'A TURN LEFT   S IMPULSE     D TURN RIGHT',
  'Z WEAPON ENERGY  X HYPERSPACE  C SHIELD ENERGY',
  'OR THE KEYPAD, OR  I O P  K L ;  , . /',
  'TAB SCORES  F8 SOUND  F9 CALL SIGN  ESC OFFLINE',
];
export const PROMPT = 'PRESS ENTER TO START';

const blocks = titleBlocks(['CITIZEN', 'WARS'], 12, 44);
const centred = (s: Screen, text: string, y: number) => s.text(text, 320 - (text.length * 10) / 2 + 5, y);

export function drawStart(s: Screen, stars: [number, number][], tick: number): void {
  s.clear();
  for (const [x, y] of stars) s.xorPixel(x, y);
  for (const b of blocks) s.blit(font, b.code, b.x, b.y);
  CONTROLS.forEach((line, n) => centred(s, line, 108 + n * 10));
  if (!(tick & 32)) centred(s, PROMPT, 176);
}
