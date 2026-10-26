/** Key bits, in the order the original walks them (original.md, Keys). */
export enum Key { CW = 0, CCW = 1, Shield = 2, Weapon = 3, Phaser = 4, Photon = 5, Impulse = 6, Cloak = 7, Hyper = 8, Left = 9, Right = 10, Down = 11, Up = 12 }

/**
 * What a player does in one tick: the key bits (bit n = Key n) and an
 * aim, the angle to snap to, which only a robot fills in; -1 for none
 * (ticket, Decisions: how a robot fills in a key state).
 */
export interface Input {
  keys: number;
  aim: number;
}

export const NO_INPUT: Input = { keys: 0, aim: -1 };

export const keysInput = (keys: number): Input => ({ keys, aim: -1 });
