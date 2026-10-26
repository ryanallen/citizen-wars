// The controls screen (design-system.md, Controls screen): every action with
// two keys or mouse buttons, chosen with the arrows, Enter or a click, and
// changed by pressing the new one. Mouse aim on or off, and back to defaults.

import { Screen } from './screen';
import { ACTIONS, bind, unbind, defaultControls, keyName, reserved, type Controls } from './controls';

const TITLE = 'CONTROLS';
const ROW_Y = 36;
const ROW_H = 9;
const AIM_Y = 145;
const RESET_Y = 155;
const DONE_Y = 165;
/** Left edges of the action names and the two key columns. */
const COL_X = [90, 270, 430];
const CELL = 14;
const INVERSE = '\x0c';

/** The rows: the actions, then mouse aim, reset and done. */
const AIM = ACTIONS.length;
const RESET = AIM + 1;
const DONE = AIM + 2;
const ROWS = DONE + 1;

const rowY = (r: number): number => (r < AIM ? ROW_Y + r * ROW_H : r === AIM ? AIM_Y : r === RESET ? RESET_Y : DONE_Y);
const at = (s: Screen, t: string, x: number, y: number) => s.text(t, x + 5, y);
const centred = (s: Screen, t: string, y: number) => s.text(t, 320 - (t.length * 10) / 2 + 5, y);

export class ControlsScreen {
  row = 0;
  col: 0 | 1 = 0;
  /** Waiting for the key or button to put on the chosen cell. */
  listening = false;
  private ticks = 0;

  constructor(public controls: Controls, private onChange: (c: Controls) => void) {}

  private set(c: Controls): void {
    this.controls = c;
    this.onChange(c);
  }

  /** Enter, Space or a click on the chosen row. */
  private choose(): void {
    if (this.row < AIM) this.listening = true;
    else if (this.row === AIM) this.set({ ...this.controls, mouseAim: !this.controls.mouseAim });
    else if (this.row === RESET) this.set(defaultControls());
  }

  /** A key pressed on this screen; true when the screen is done. */
  key(code: string): boolean {
    if (this.listening) {
      this.listening = false;
      if (code === 'Escape' || reserved(code)) return false;
      this.put(code);
      return false;
    }
    switch (code) {
      case 'Escape': return true;
      case 'ArrowUp': this.row = (this.row + ROWS - 1) % ROWS; break;
      case 'ArrowDown': this.row = (this.row + 1) % ROWS; break;
      case 'ArrowLeft': this.col = 0; break;
      case 'ArrowRight': this.col = 1; break;
      case 'Delete': case 'Backspace':
        if (this.row < AIM) this.set({ ...this.controls, bindings: unbind(this.controls.bindings, ACTIONS[this.row].key, this.col) });
        break;
      case 'Enter': case 'NumpadEnter': case 'Space':
        if (this.row === DONE) return true;
        this.choose();
        break;
    }
    return false;
  }

  private put(code: string): void {
    const b = this.controls.bindings;
    const key = ACTIONS[this.row].key;
    // A second key on an action with no first goes first.
    const slot = this.col === 1 && !b[key][0] ? 0 : this.col;
    this.set({ ...this.controls, bindings: bind(b, key, slot, code) });
  }

  /** The cell under the pointer, as [row, col], or null. */
  private hit(fx: number, fy: number): [number, 0 | 1] | null {
    const x = fx * 640;
    const y = fy * 200;
    for (let r = 0; r < ROWS; r++) {
      if (Math.abs(y - rowY(r)) > ROW_H / 2) continue;
      if (r >= AIM) return [r, 0];
      if (x >= COL_X[2] - 10) return [r, 1];
      return [r, 0];
    }
    return null;
  }

  hover(fx: number, fy: number): void {
    if (this.listening) return;
    const h = this.hit(fx, fy);
    if (h) [this.row, this.col] = h;
  }

  /** A mouse button pressed; true when the screen is done. */
  click(button: number, fx: number, fy: number): boolean {
    if (this.listening) {
      this.listening = false;
      this.put(`Mouse${button}`);
      return false;
    }
    if (button !== 0) return false;
    const h = this.hit(fx, fy);
    if (!h) return false;
    [this.row, this.col] = h;
    if (this.row === DONE) return true;
    this.choose();
    return false;
  }

  step(n = 1): void {
    this.ticks += n;
  }

  draw(s: Screen): void {
    s.clear();
    centred(s, TITLE, 10);
    at(s, 'ACTION', COL_X[0], 24);
    at(s, 'KEY', COL_X[1], 24);
    at(s, 'OR', COL_X[2], 24);
    const b = this.controls.bindings;
    const blink = this.listening && !(this.ticks & 16);
    ACTIONS.forEach(({ key, name }, r) => {
      const y = rowY(r);
      at(s, name, COL_X[0], y);
      for (const c of [0, 1] as const) {
        const chosen = r === this.row && c === this.col;
        const t = chosen && this.listening ? (blink ? '' : '?') : keyName(b[key][c]);
        at(s, t, COL_X[c + 1], y);
        if (chosen && !this.listening) at(s, INVERSE.repeat(CELL), COL_X[c + 1] - 10, y);
      }
    });
    const rows: [number, string][] = [
      [AIM, `MOUSE AIM      ${this.controls.mouseAim ? 'ON' : 'OFF'}`],
      [RESET, 'RESET TO DEFAULTS'],
      [DONE, 'DONE'],
    ];
    for (const [r, t] of rows) {
      at(s, t, COL_X[0], rowY(r));
      if (r === this.row) at(s, INVERSE.repeat(t.length + 2), COL_X[0] - 10, rowY(r));
    }
    centred(s, this.listening ? 'PRESS A KEY OR MOUSE BUTTON   ESC CANCELS' : 'ENTER OR CLICK CHANGES   DEL CLEARS   ESC DONE', 178);
    const all = Object.values(b).flat();
    if (all.some((c) => c.startsWith('Control')) && all.includes('KeyW')) centred(s, 'CTRL+W CLOSES THE BROWSER TAB', 190);
  }
}
