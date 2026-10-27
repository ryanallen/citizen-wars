// Which keys and mouse buttons do what (design-system.md, Controls). The player's
// own keys (the left ship offline, your ship online) can be changed on the
// controls screen and are kept in the browser; the second player's keys, the
// keypad and arrows, are fixed. Mouse buttons are codes too: Mouse0 left,
// Mouse1 middle, Mouse2 right.

import { Key } from './sim/game';
import type { Page } from './design/pages';

/** The actions in the order the controls screen lists them. */
export const ACTIONS: { key: Key; name: string }[] = [
  { key: Key.Up, name: 'MOVE UP' },
  { key: Key.Left, name: 'MOVE LEFT' },
  { key: Key.Down, name: 'MOVE DOWN' },
  { key: Key.Right, name: 'MOVE RIGHT' },
  { key: Key.Impulse, name: 'THRUST' },
  { key: Key.CCW, name: 'TURN LEFT' },
  { key: Key.CW, name: 'TURN RIGHT' },
  { key: Key.Photon, name: 'PHOTONS' },
  { key: Key.Phaser, name: 'PHASERS' },
  { key: Key.Hyper, name: 'HYPERSPACE' },
  { key: Key.Cloak, name: 'CLOAK' },
  { key: Key.Weapon, name: 'TO ENERGY' },
  { key: Key.Shield, name: 'TO SHIELD' },
];

/** Each action's two codes, the second '' when unbound. */
export type Bindings = Record<number, [string, string]>;

export interface Controls {
  bindings: Bindings;
  /** The ship faces the mouse pointer. */
  mouseAim: boolean;
}

export const DEFAULT_BINDINGS: Bindings = {
  [Key.Up]: ['KeyW', ''],
  [Key.Left]: ['KeyA', ''],
  [Key.Down]: ['KeyS', ''],
  [Key.Right]: ['KeyD', ''],
  [Key.Impulse]: ['', ''],
  [Key.CCW]: ['', ''],
  [Key.CW]: ['', ''],
  [Key.Photon]: ['Mouse0', ''],
  [Key.Phaser]: ['Mouse2', 'KeyF'],
  [Key.Hyper]: ['Space', 'Mouse1'],
  [Key.Cloak]: ['KeyR', ''],
  [Key.Weapon]: ['KeyQ', ''],
  [Key.Shield]: ['KeyE', ''],
};

export const defaultControls = (): Controls => ({ bindings: structuredClone(DEFAULT_BINDINGS), mouseAim: true });

/** The second player's keys: the keypad, or the arrows with the keys around them. */
export const SECOND_PLAYER: Record<string, Key> = {
  Numpad8: Key.Impulse, Numpad4: Key.CCW, Numpad6: Key.CW, Numpad9: Key.Photon, Numpad7: Key.Phaser,
  Numpad0: Key.Hyper, Numpad2: Key.Hyper, Numpad5: Key.Cloak, Numpad1: Key.Weapon, Numpad3: Key.Shield,
  ArrowUp: Key.Impulse, ArrowLeft: Key.CCW, ArrowRight: Key.CW, ArrowDown: Key.Hyper,
  Enter: Key.Photon, NumpadEnter: Key.Photon, Slash: Key.Phaser, ShiftRight: Key.Cloak,
  Comma: Key.Weapon, Period: Key.Shield,
};

/** Codes the game keeps for itself, which no action can take. */
export const reserved = (code: string): boolean => /^(Escape|Tab|F\d+|Meta.*|OSLeft|OSRight)$/.test(code);

/** Code to side and key: the second player's, then the player's own over them. */
export function keymap(b: Bindings): Record<string, [0 | 1, Key]> {
  const m: Record<string, [0 | 1, Key]> = {};
  for (const [code, key] of Object.entries(SECOND_PLAYER)) m[code] = [1, key];
  for (const { key } of ACTIONS) for (const code of b[key]) if (code) m[code] = [0, key];
  return m;
}

/** `code` on `action`'s slot, taken off any other action that had it. */
export function bind(b: Bindings, action: Key, slot: 0 | 1, code: string): Bindings {
  const out: Bindings = {};
  for (const { key } of ACTIONS) out[key] = b[key].map((c) => (c === code ? '' : c)) as [string, string];
  out[action][slot] = code;
  for (const { key } of ACTIONS) out[key] = compact(out[key]);
  return out;
}

export function unbind(b: Bindings, action: Key, slot: 0 | 1): Bindings {
  const out = structuredClone(b);
  out[action][slot] = '';
  out[action] = compact(out[action]);
  return out;
}

/** An action's keys with an empty first slot filled from the second. */
const compact = ([a, b]: [string, string]): [string, string] => (a ? [a, b] : [b, '']);

const NAMES: Record<string, string> = {
  Mouse0: 'LEFT CLICK', Mouse1: 'MID CLICK', Mouse2: 'RIGHT CLICK', Mouse3: 'MOUSE 4', Mouse4: 'MOUSE 5',
  Space: 'SPACE', ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL',
  AltLeft: 'L ALT', AltRight: 'R ALT', Enter: 'ENTER', NumpadEnter: 'PAD ENTER', Backspace: 'BACKSPACE',
  CapsLock: 'CAPS LOCK', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[',
  BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`',
};

/** A code as the controls screen names it, in capitals. */
export function keyName(code: string): string {
  if (!code) return '-';
  if (code in NAMES) return NAMES[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code) ?? /^Numpad(.+)$/.exec(code);
  if (m) return code.startsWith('Numpad') ? `PAD ${m[1].toUpperCase()}` : m[1];
  return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toUpperCase().slice(0, 11);
}

const SHORT: Record<string, string> = {
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'SPC', ShiftLeft: 'SHFT', ShiftRight: 'SHFT',
  ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT', Enter: 'ENT', NumpadEnter: 'ENT',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RGHT',
};

/** A code short enough to share a 7-character GAME KEYS cell. */
export function shortName(code: string): string {
  if (code in SHORT) return SHORT[code];
  if (code.startsWith('Numpad')) return code.slice(6, 9).toUpperCase();
  return keyName(code).slice(0, 4);
}

/** Up to two codes in one 7-character cell, centred. */
function cell(codes: string[]): string {
  const names = codes.filter(Boolean).map(shortName);
  let t = names.slice(0, 2).join('/');
  if (t.length > 7) t = names[0] ?? '';
  const left = Math.floor((7 - t.length) / 2);
  return ' '.repeat(left) + t + ' '.repeat(7 - t.length - left);
}

// The GAME KEYS grid, cell by cell: top, middle and bottom rows of three.
const GRID: Key[][] = [
  [Key.Phaser, Key.Impulse, Key.Photon],
  [Key.CCW, Key.Hyper, Key.CW],
  [Key.Weapon, Key.Cloak, Key.Shield],
];

/**
 * The GAME KEYS page with the keys as they are now. The grid's labels are
 * laid out for these actions: thrust top centre, hyperspace in the middle,
 * cloak bottom centre.
 */
export function keysPage(base: Page, b: Bindings): Page {
  const second = (k: Key) => Object.keys(SECOND_PLAYER).filter((c) => SECOND_PLAYER[c] === k);
  const rowY = [64, 96, 128];
  return base.map(([x, y, t]) => {
    const r = rowY.indexOf(y);
    if (r < 0 || x !== 50) return [x, y, t];
    const l = GRID[r].map((k) => cell(b[k]));
    const rr = GRID[r].map((k) => cell(second(k)));
    return [x, y, `\x15${l.join('\x15')}\x15    \x15${rr.join('\x15')}\x15`];
  });
}

const STORE = 'spacewar-live.controls';
/** Where they were kept before the game was renamed, read once and moved. */
const OLD_STORE = 'citizenwars.controls';

export function loadControls(): Controls {
  try {
    const raw = localStorage.getItem(STORE) ?? localStorage.getItem(OLD_STORE);
    if (!raw) return defaultControls();
    const c = JSON.parse(raw) as Controls;
    const d = defaultControls();
    const added: Key[] = [];
    for (const { key } of ACTIONS) {
      const v = c.bindings?.[key];
      if (Array.isArray(v) && v.length === 2 && v.every((s) => typeof s === 'string' && !reserved(s))) d.bindings[key] = v as [string, string];
      else added.push(key);
    }
    // An action newer than the saved keys takes its default keys off whatever had them.
    for (const key of added) DEFAULT_BINDINGS[key].forEach((code, slot) => { if (code) d.bindings = bind(d.bindings, key, slot as 0 | 1, code); });
    d.mouseAim = c.mouseAim !== false;
    return d;
  } catch {
    return defaultControls();
  }
}

export function saveControls(c: Controls): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(c));
  } catch {
    // Kept for this visit only.
  }
}
