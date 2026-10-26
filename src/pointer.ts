// Mouse aim (design-system.md, Controls): the ship turns toward the pointer at
// its own turn rate, as if a turn key were held, so it turns no faster than
// keys turn it. The buttons are keys like any other (controls.ts).

import { Key, type Game } from './sim/game';

export class Pointer {
  /** Where the pointer is, as a fraction of the screen each way; null until it moves over it. */
  at: [number, number] | null = null;
  /** Steering follows the pointer from its next move after a turn key is pressed. */
  steering = false;

  move(fx: number, fy: number): void {
    this.at = [fx, fy];
    this.steering = true;
  }

  /** CW or CCW while `side`'s ship points more than one step off the pointer; else 0. */
  keys(g: Game, side: number): number {
    const i = g.ship(side);
    if (!this.steering || !this.at || g.state[i] <= 0) return 0;
    const dx = this.at[0] * g.w - g.x(i);
    const dy = this.at[1] * g.h - g.y(i);
    const want = Math.round((Math.atan2(dy, dx) * 128) / Math.PI) & 255;
    const d = ((want - g.angle[i] + 128) & 255) - 128;
    return d >= 2 ? 1 << Key.CW : d <= -2 ? 1 << Key.CCW : 0;
  }
}
