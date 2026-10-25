import { describe, expect, test } from 'vitest';
import { Game, Key } from './game';
import { keysInput } from './input';
import { aim, defensive, offensive, nearest, type RobotView, type Enemy } from './robot';
import { Rng } from './rng';

const bit = (k: Key) => 1 << k;

/** A random source that answers the given values in turn. */
function scripted(...values: number[]): Rng {
  const r = new Rng(0);
  let n = 0;
  r.next = () => values[n++ % values.length];
  return r;
}

const ship = (x: number, y: number): Enemy => ({ ship: { x, y, alive: true }, torpedoes: [] });

function view(over: Partial<RobotView> = {}): RobotView {
  return { x: 100, y: 100, energy: 60, shield: 60, enemies: [ship(400, 150)], ...over };
}

describe('robots fill in an Input', () => {
  test('the game reads a robot through the same Input a person gives', () => {
    const g = new Game(1);
    g.startRound();
    const input = g.robotInput(1);
    expect(input.aim).toBe(aim(g.x(0) - g.x(8), g.y(0) - g.y(8)));
    const h = new Game(1);
    h.startRound();
    h.applyInput(1, input);
    expect(h.angle[8]).toBe(input.aim);
  });
});

describe('the defensive robot', () => {
  test('aims at and phasers a threat inside 96 px', () => {
    const v = view({ enemies: [{ ship: { x: 400, y: 150, alive: true }, torpedoes: [{ x: 150, y: 150, alive: true }] }] });
    const input = defensive(v, scripted(255, 1));
    expect(input.aim).toBe(32);
    expect(input.keys & bit(Key.Phaser)).toBeTruthy();
  });

  test('with energy 0 it only balances and lets impulse go', () => {
    const input = defensive(view({ energy: 0, shield: 10 }), scripted(0, 0));
    expect(input).toEqual({ keys: bit(Key.Weapon), aim: -1 });
  });

  test('impulse 16 in 256, hyperspace 1 in 1024', () => {
    expect(defensive(view(), scripted(15, 1)).keys & bit(Key.Impulse)).toBeTruthy();
    expect(defensive(view(), scripted(16, 1)).keys & bit(Key.Impulse)).toBe(0);
    expect(defensive(view(), scripted(255, 0x400)).keys & bit(Key.Hyper)).toBeTruthy();
  });
});

describe('the offensive robot', () => {
  test('faces its target always', () => {
    expect(offensive(view(), scripted(255, 255, 1)).aim).toBe(aim(300, 50));
  });

  test('fires the phaser close and torpedoes far, 8 in 256', () => {
    const close = view({ enemies: [ship(150, 150)] });
    expect(offensive(close, scripted(255, 7, 1)).keys & bit(Key.Phaser)).toBeTruthy();
    expect(offensive(view(), scripted(255, 7, 1)).keys & bit(Key.Photon)).toBeTruthy();
    expect(offensive(view(), scripted(255, 8, 1)).keys & (bit(Key.Photon) | bit(Key.Phaser))).toBe(0);
  });
});

describe('many ships', () => {
  test('both robots pick the nearest of three', () => {
    const v = view({ enemies: [ship(400, 100), ship(130, 140), ship(100, 300)] });
    expect(nearest(v)[0].ship.x).toBe(130);
    expect(offensive(v, scripted(255, 255, 1)).aim).toBe(aim(30, 40));
    v.enemies[1].ship.x = 160;
    expect(defensive(v, scripted(255, 1)).aim).toBe(aim(60, 40));
  });
});

describe('ROBOT on the menu and stand-ins', () => {
  test('with both robots on, a round plays to its end on its own', () => {
    const g = new Game(11);
    g.options = { planet: true, gravity: true, robot: [true, true] };
    g.startRound();
    let n = 0;
    while (g.step() === 'play' && n < 72.8 * 60 * 30) n++;
    expect(g.wins[0] + g.wins[1]).toBe(1);
  });

  test('a robot switched on mid-round takes over, and off hands back', () => {
    const g = new Game(4);
    g.startRound();
    g.inputs[1] = keysInput(bit(Key.CW));
    for (let n = 0; n < 10; n++) g.step();
    g.options.robot[1] = true;
    g.step();
    expect(g.angle[8]).toBe(aim(g.x(0) - g.x(8), g.y(0) - g.y(8)));
    g.options.robot[1] = false;
    const a = g.angle[8];
    g.step();
    expect(g.angle[8]).toBe((a + 2) & 255);
  });
});

describe('check: robot against robot', () => {
  test('twenty rounds with planet and gravity each end in a death within 30 simulated minutes', () => {
    const g = new Game(2024);
    g.options = { planet: true, gravity: true, robot: [true, true] };
    const limit = Math.ceil(72.8 * 60 * 30);
    for (let r = 0; r < 20; r++) {
      g.startRound();
      let n = 0;
      while (g.step() === 'play' && n < limit) n++;
      expect(n).toBeLessThan(limit);
    }
    expect(g.wins[0] + g.wins[1]).toBe(20);
  });
});

describe('aim', () => {
  test('points at the target by octant', () => {
    expect([aim(10, 0), aim(0, 10), aim(-10, 0), aim(0, -10), aim(10, 10)]).toEqual([0, 64, 128, 192, 32]);
  });
});

