// Keys and mouse buttons to each player's key state (controls.ts): the
// player's own, which they can change, and the second player's keypad and arrows.

import { Key } from './sim/game';
import { DEFAULT_BINDINGS, keymap } from './controls';

export const KEYMAP = keymap(DEFAULT_BINDINGS);

/**
 * Held keys as two bit masks, bit n = Key n; a key held by two codes stays held
 * until both lift. A key pressed and let go between two ticks still counts as
 * held for the next tick, so a quick tap is never lost.
 */
export class KeyState {
  private held = new Set<string>();
  private tapped = new Set<string>();

  constructor(public map: Record<string, [0 | 1, Key]> = KEYMAP) {}

  down(code: string): boolean {
    if (!(code in this.map)) return false;
    this.held.add(code);
    this.tapped.add(code);
    return true;
  }

  up(code: string): boolean {
    if (!(code in this.map)) return false;
    this.held.delete(code);
    return true;
  }

  clear(): void {
    this.held.clear();
    this.tapped.clear();
  }

  /** The masks for this tick; taps since the last call are counted once. */
  masks(): [number, number] {
    const m: [number, number] = [0, 0];
    for (const code of new Set([...this.held, ...this.tapped])) {
      const [side, key] = this.map[code];
      m[side] |= 1 << key;
    }
    this.tapped.clear();
    return m;
  }
}
