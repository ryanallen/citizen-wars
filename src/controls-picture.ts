// The start screen's picture of the controls (design-system.md, Start screen): a
// keyboard of the keys W A S D sit among, and a mouse, each key and button named
// with what it does as the player has it bound. W A S D carry arrows for the way
// they push the ship.

import { Screen } from './screen';
import { Key } from './sim/game';
import { keymap, type Controls } from './controls';

/** What a pictured key says it does, short enough to fit beside its letter. */
const LABEL: Record<number, string> = {
  [Key.Impulse]: 'THRUST', [Key.StrafeLeft]: 'STRAFE', [Key.StrafeRight]: 'STRAFE', [Key.Reverse]: 'REVERSE',
  [Key.CCW]: 'TURN', [Key.CW]: 'TURN', [Key.Photon]: 'PHOTONS', [Key.Phaser]: 'PHASERS', [Key.Hyper]: 'HYPER',
  [Key.Cloak]: 'CLOAK', [Key.Weapon]: 'TO ENERGY', [Key.Shield]: 'TO SHIELD',
};

/** The arrows for the keys that push the ship, about square on the screen's tall pixels. */
const ARROW: Record<number, string[]> = {
  [Key.Impulse]: ['.....#.....', '...#####...', '.#########.', '....###....', '....###....', '....###....'],
  [Key.Reverse]: ['....###....', '....###....', '....###....', '.#########.', '...#####...', '.....#.....'],
  [Key.StrafeLeft]: ['....#..........', '..###..........', '###############', '..###..........', '....#..........'],
  [Key.StrafeRight]: ['..........#....', '..........###..', '###############', '..........###..', '..........#....'],
};

const KEY_W = 116;
const KEY_H = 13;
const PITCH = 120;
const ROW = 15;
const TOP = 98;

/** The pictured keys: code, the name on its cap, left edge and width. */
const KEYS: [string, string, number, number][] = [
  ['KeyQ', 'Q', 16, KEY_W], ['KeyW', 'W', 16 + PITCH, KEY_W], ['KeyE', 'E', 16 + 2 * PITCH, KEY_W],
  ['KeyA', 'A', 28, KEY_W], ['KeyS', 'S', 28 + PITCH, KEY_W], ['KeyD', 'D', 28 + 2 * PITCH, KEY_W],
  ['ShiftLeft', 'SHIFT', 40, KEY_W], ['KeyZ', 'Z', 40 + PITCH, KEY_W], ['KeyC', 'C', 40 + 2 * PITCH, KEY_W],
  ['Space', 'SPACE', 100, 200],
];
const KEY_ROWS = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3];

// The mouse: its body, the line under its buttons, and the wheel.
const MOUSE_X = 480;
const MOUSE_W = 66;
const MOUSE_H = 48;
const BUTTONS_H = 20;
const WHEEL: [number, number, number, number] = [MOUSE_X + MOUSE_W / 2 - 4, TOP + 4, 9, 11];

export const PICTURE_BOTTOM = TOP + 3 * ROW + KEY_H;

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

  KEYS.forEach(([code, cap, x, w], n) => {
    const y = TOP + KEY_ROWS[n] * ROW;
    box(s, x, y, w, KEY_H);
    const k = action(code);
    const label = k === null ? '' : code === 'Space' && k === Key.Hyper ? 'HYPERSPACE' : LABEL[k];
    const arrowRows = k === null ? undefined : ARROW[k];
    // The cap's name, a gap the arrow sits in when it has one, then what it does.
    const t = label ? `${cap}${arrowRows ? '   ' : ' '}${label}` : cap;
    const left = x + Math.round((w - textW(t)) / 2);
    const mid = y + (KEY_H >> 1);
    text(s, t, left, mid);
    // The gap runs from the cap's last glyph to the label's first, 32 pixels.
    if (arrowRows) arrow(s, arrowRows, left + textW(cap) + ((32 - arrowRows[0].length) >> 1), mid - (arrowRows.length >> 1));
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
