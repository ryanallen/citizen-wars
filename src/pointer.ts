// Mouse aim (design-system.md, Controls): the ship faces the pointer, snapped to
// it each tick through the Input's aim as a robot's is. The buttons are keys like
// any other (controls.ts).

import type { Game } from './sim/game';

export class Pointer {
  /** Where the pointer is, as a fraction of the screen each way; null until it moves over it. */
  at: [number, number] | null = null;
  /** Steering follows the pointer from its next move after a turn key is pressed. */
  steering = false;

  move(fx: number, fy: number): void {
    this.at = [fx, fy];
    this.steering = true;
  }

  /** The angle from `side`'s ship to the pointer, or -1 while it is not steering. */
  aim(g: Game, side: number): number {
    const i = g.ship(side);
    if (!this.steering || !this.at || g.state[i] <= 0) return -1;
    const dx = this.at[0] * g.w - g.x(i);
    const dy = this.at[1] * g.h - g.y(i);
    return Math.round((Math.atan2(dy, dx) * 128) / Math.PI) & 255;
  }
}
