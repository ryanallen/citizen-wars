// Keys to each player's key state (ticket, Phase 1): left Q W E / A S D / Z X C,
// right keypad 7 8 9 / 4 5 6 / 1 2 3, or I O P / K L ; / , . / with no keypad.

import { Key } from './sim/game';

export const KEYMAP: Record<string, [0 | 1, Key]> = {
  KeyQ: [0, Key.Phaser], KeyW: [0, Key.Cloak], KeyE: [0, Key.Photon],
  KeyA: [0, Key.CCW], KeyS: [0, Key.Impulse], KeyD: [0, Key.CW],
  KeyZ: [0, Key.Weapon], KeyX: [0, Key.Hyper], KeyC: [0, Key.Shield],
  Numpad7: [1, Key.Phaser], Numpad8: [1, Key.Cloak], Numpad9: [1, Key.Photon],
  Numpad4: [1, Key.CCW], Numpad5: [1, Key.Impulse], Numpad6: [1, Key.CW],
  Numpad1: [1, Key.Weapon], Numpad2: [1, Key.Hyper], Numpad3: [1, Key.Shield],
  KeyI: [1, Key.Phaser], KeyO: [1, Key.Cloak], KeyP: [1, Key.Photon],
  KeyK: [1, Key.CCW], KeyL: [1, Key.Impulse], Semicolon: [1, Key.CW],
  Comma: [1, Key.Weapon], Period: [1, Key.Hyper], Slash: [1, Key.Shield],
};

/**
 * Held keys as two bit masks, bit n = Key n; a key held by two codes stays held
 * until both lift. A key pressed and let go between two ticks still counts as
 * held for the next tick, so a quick tap is never lost.
 */
export class KeyState {
  private held = new Set<string>();
  private tapped = new Set<string>();

  down(code: string): boolean {
    if (!(code in KEYMAP)) return false;
    this.held.add(code);
    this.tapped.add(code);
    return true;
  }

  up(code: string): boolean {
    if (!(code in KEYMAP)) return false;
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
      const [side, key] = KEYMAP[code];
      m[side] |= 1 << key;
    }
    this.tapped.clear();
    return m;
  }
}
