// The start screen's picture of the controls (design-system.md, Start screen): a
// keyboard of the keys W A S D sit among, and a mouse, each key and button named
// with what it does as the player has it bound. W A S D carry arrows for the way
// they push the ship across the screen.

import { Screen } from './screen';
import { Key } from './sim/game';
import { keymap, type Controls } from './controls';

/** What a pictured key says it does, short enough to fit beside its letter. */
const LABEL: Record<number, string> = {
  [Key.Up]: 'UP', [Key.Left]: 'LEFT', [Key.Down]: 'DOWN', [Key.Right]: 'RIGHT', [Key.Impulse]: 'THRUST',
  [Key.CCW]: 'TURN', [Key.CW]: 'TURN', [Key.Photon]: 'PHOTONS', [Key.Phaser]: 'PHASERS', [Key.Hyper]: 'HYPER',
  [Key.Cloak]: 'CLOAK', [Key.Weapon]: 'TO ENERGY', [Key.Shield]: 'TO SHIELD',
};

/** The arrows for the keys that push the ship, about square on the screen's tall pixels. */
const ARROW: Record<number, string[]> = {
  [Key.Up]: ['.....#.....', '...#####...', '.#########.', '....###....', '....###....', '....###....'],
  [Key.Down]: ['....###....', '....###....', '....###....', '.#########.', '...#####...', '.....#.....'],
  [Key.Left]: ['....#..........', '..###..........', '###############', '..###..........', '....#..........'],
  [Key.Right]: ['..........#....', '..........###..', '###############', '..........###..', '..........#....'],
};

const KEY_W = 96;
const KEY_H = 22;
const PITCH = 100;
const TOP = 98;
const SPACE_H = 13;

/** The pictured keys: code, the name on its cap, left edge, top, width, height. */
const KEYS: [string, string, number, number, number, number][] = [
  ...['Q', 'W', 'E', 'R'].map((c, n): [string, string, number, number, number, number] => [`Key${c}`, c, 8 + n * PITCH, TOP, KEY_W, KEY_H]),
  ...['A', 'S', 'D', 'F'].map((c, n): [string, string, number, number, number, number] => [`Key${c}`, c, 20 + n * PITCH, TOP + KEY_H + 2, KEY_W, KEY_H]),
  ['Space', 'SPACE', 90, TOP + 2 * (KEY_H + 2), 220, SPACE_H],
];

// The mouse: its body, the line under its buttons, and the wheel.
const MOUSE_X = 494;
const MOUSE_W = 60;
const MOUSE_H = 48;
const BUTTONS_H = 20;
const WHEEL: [number, number, number, number] = [MOUSE_X + MOUSE_W / 2 - 4, TOP + 4, 9, 11];

export const PICTURE_BOTTOM = TOP + 2 * (KEY_H + 2) + SPACE_H;

/** Text's width in pixels: 10 a character, the last glyph 8 wide. */
const textW = (t: string) => t.length * 10 - 2;

/** Text with its left edge at x and its middle row at y. */
const text = (s: Screen, t: string, x: number, y: number) => s.text(t, x + 4, y);

function line(s: Screen, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) s.setPixel(x, y, true);
}

/** An outlined box, its inside cleared of stars, its corners cut round. */
function box(s: Screen, x: number, y: number, w: number, h: number, round = 1): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) s.setPixel(xx, yy, false);
  line(s, x + round, y, x + w - 1 - round, y);
  line(s, x + round, y + h - 1, x + w - 1 - round, y + h - 1);
  line(s, x, y + round, x, y + h - 1 - round);
  line(s, x + w - 1, y + round, x + w - 1, y + h - 1 - round);
  for (let r = 1; r < round; r++) {
    s.setPixel(x + r, y + round - r, true); s.setPixel(x + w - 1 - r, y + round - r, true);
    s.setPixel(x + r, y + h - 1 - round + r, true); s.setPixel(x + w - 1 - r, y + h - 1 - round + r, true);
  }
}

function arrow(s: Screen, rows: string[], x: number, y: number): void {
  rows.forEach((row, r) => [...row].forEach((c, k) => { if (c === '#') s.setPixel(x + k, y + r, true); }));
}

export function drawControlsPicture(s: Screen, c: Controls): void {
  const map = keymap(c.bindings);
  const action = (code: string): Key | null => (map[code]?.[0] === 0 ? map[code][1] : null);

  KEYS.forEach(([code, cap, x, y, w, h]) => {
    box(s, x, y, w, h);
    const k = action(code);
    const label = k === null ? '' : code === 'Space' && k === Key.Hyper ? 'HYPERSPACE' : LABEL[k];
    const centre = (t: string) => x + Math.round((w - textW(t)) / 2);
    if (h < KEY_H) {
      // The space bar: its name and what it does on one line.
      const t = label ? `${cap} ${label}` : cap;
      text(s, t, centre(t), y + (h >> 1));
      return;
    }
    // The cap's name on top, with the arrow beside it when it pushes the ship; what it does below.
    const arrowRows = k === null ? undefined : ARROW[k];
    const top = y + 6;
    if (arrowRows) {
      const left = x + Math.round((w - textW(cap) - 8 - arrowRows[0].length) / 2);
      text(s, cap, left, top);
      arrow(s, arrowRows, left + textW(cap) + 8, top - (arrowRows.length >> 1));
    } else text(s, cap, centre(cap), top);
    if (label) text(s, label, centre(label), y + 15);
  });

  // The mouse, its buttons named either side and the wheel's below the right one.
  box(s, MOUSE_X, TOP, MOUSE_W, MOUSE_H, 6);
  line(s, MOUSE_X, TOP + BUTTONS_H, MOUSE_X + MOUSE_W - 1, TOP + BUTTONS_H);
  line(s, MOUSE_X + MOUSE_W / 2, TOP, MOUSE_X + MOUSE_W / 2, WHEEL[1]);
  line(s, MOUSE_X + MOUSE_W / 2, WHEEL[1] + WHEEL[3] - 1, MOUSE_X + MOUSE_W / 2, TOP + BUTTONS_H);
  box(s, ...WHEEL, 2);
  const by = TOP + BUTTONS_H / 2;
  const named = (code: string) => { const k = action(code); return k === null ? '' : LABEL[k]; };
  const left = named('Mouse0');
  if (left) {
    text(s, left, MOUSE_X - 14 - textW(left), by);
    line(s, MOUSE_X - 10, by, MOUSE_X + 10, by);
  }
  const right = named('Mouse2');
  if (right) {
    text(s, right, MOUSE_X + MOUSE_W + 14, by);
    line(s, MOUSE_X + MOUSE_W - 10, by, MOUSE_X + MOUSE_W + 10, by);
  }
  const mid = named('Mouse1');
  if (mid) {
    const wx = WHEEL[0] + (WHEEL[2] >> 1);
    const wy = TOP + BUTTONS_H + 10;
    line(s, wx, WHEEL[1] + WHEEL[3], wx, wy);
    line(s, wx, wy, MOUSE_X + MOUSE_W + 10, wy);
    text(s, mid, MOUSE_X + MOUSE_W + 14, wy);
  }
  if (c.mouseAim) {
    const t = 'MOVE TO AIM';
    text(s, t, MOUSE_X + (MOUSE_W - textW(t)) / 2, TOP + MOUSE_H + 6);
  }
}
