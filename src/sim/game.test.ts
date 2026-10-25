import { describe, expect, test } from 'vitest';
import { Game, Key, PASSES_PER_TICK, EXPLOSION_FRAMES, EXPLOSION_TICKS_PER_FRAME, EXPLOSION_HOLD_TICKS } from './game';
import { sin, cos } from './tables';

const F = 65536;

function round(seed = 7): Game {
  const g = new Game(seed);
  g.startRound();
  return g;
}

function hold(g: Game, side: 0 | 1, keys: Key[], ticks: number): void {
  g.keys[side] = keys.reduce((m, k) => m | (1 << k), 0);
  for (let n = 0; n < ticks; n++) g.step();
  g.keys[side] = 0;
}

function idle(g: Game, ticks: number): void {
  for (let n = 0; n < ticks; n++) g.step();
}

/** Run until the timer's tick counter reads a given value (mod 256). */
function untilTick(g: Game, t: number): void {
  while (g.tick !== t) g.step();
}

describe('ships', () => {
  test('start at (160, 46) facing 0 and (480, 138) facing 128, still, shield 31, energy 127', () => {
    const g = round();
    expect([g.x(0), g.y(0), g.angle[0], g.x(8), g.y(8), g.angle[8]]).toEqual([160, 46, 0, 480, 138, 128]);
    expect([g.vx[0], g.vy[0], g.vx[8], g.vy[8]]).toEqual([0, 0, 0, 0]);
    expect([g.shield[0], g.shield[1], g.energy[0], g.energy[8]]).toEqual([31, 31, 127, 127]);
  });

  test('holding D turns 2 steps a tick, a full turn in 128 ticks', () => {
    const g = round();
    hold(g, 0, [Key.CW], 1);
    const start = g.angle[0];
    hold(g, 0, [Key.CW], 128);
    expect(g.angle[0]).toBe(start);
    hold(g, 0, [Key.CW], 10);
    expect(g.angle[0]).toBe((start + 20) & 255);
  });

  test('A turns the other way', () => {
    const g = round();
    hold(g, 0, [Key.CCW], 11);
    expect(g.angle[0]).toBe(256 - 22);
  });

  test('impulse adds cos/8 and sin/8 a tick and no drag slows it', () => {
    const g = round();
    g.angle[0] = 32;
    hold(g, 0, [Key.Impulse], 10);
    expect(g.vx[0]).toBe(10 * Math.floor(cos(32) / 8));
    expect(g.vy[0]).toBe(10 * Math.floor(sin(32) / 8));
    const v = g.vx[0];
    idle(g, 50);
    expect(g.vx[0]).toBe(v);
  });

  test('a velocity axis stops gaining whole pixels at 8 a tick', () => {
    const g = round();
    g.energy[0] = 127;
    for (let n = 0; n < 40; n++) {
      g.energy[0] = 127;
      hold(g, 0, [Key.Impulse], 32);
    }
    expect(Math.floor(g.vx[0] / F)).toBe(7);
  });
});

describe('energy and shields', () => {
  test('impulse costs 1 energy every 32 ticks', () => {
    const g = round();
    hold(g, 0, [Key.Impulse], 32 * 5);
    expect(g.energy[0]).toBe(122);
  });

  test('cloak costs 1 every 32 ticks and hides the ship', () => {
    const g = round();
    hold(g, 0, [Key.Cloak], 32 * 3);
    expect(g.energy[0]).toBe(124);
    g.keys[0] = 1 << Key.Cloak;
    g.step();
    expect(g.drawn[0]).toBe(false);
    g.keys[0] = 0;
    g.step();
    expect(g.drawn[0]).toBe(true);
  });

  test('energy recharges 1 every 256 ticks, up to 127', () => {
    const g = round();
    g.energy[0] = 100;
    untilTick(g, 1);
    idle(g, 256 * 3);
    expect(g.energy[0]).toBe(103);
    g.energy[0] = 127;
    idle(g, 256);
    expect(g.energy[0]).toBe(127);
  });

  test('energy at 0 does not recharge', () => {
    const g = round();
    g.energy[0] = 0;
    idle(g, 256 * 3);
    expect(g.energy[0]).toBe(0);
  });

  test('with no energy the phaser and hyperspace are refused', () => {
    const g = round();
    g.energy[0] = 0;
    hold(g, 0, [Key.Phaser], 2);
    expect(g.phaserTimer[0]).toBe(-1);
    g.energy[0] = 7;
    hold(g, 0, [Key.Hyper], 2);
    expect(g.state[0]).toBe(1);
  });
});

describe('the Z and C keys', () => {
  test('C moves energy into shield one unit a pass on every 4th tick', () => {
    const g = round();
    hold(g, 0, [Key.Shield], 40);
    expect(g.shield[0]).toBe(31 + 10 * PASSES_PER_TICK);
    expect(g.energy[0]).toBe(127 - 10 * PASSES_PER_TICK);
  });

  test('Z moves shield into energy', () => {
    const g = round();
    g.energy[0] = 100;
    hold(g, 0, [Key.Weapon], 40);
    expect(g.shield[0]).toBe(31 - 10 * PASSES_PER_TICK);
    expect(g.energy[0]).toBe(100 + 10 * PASSES_PER_TICK);
  });

  test('Z does not take shield below 0', () => {
    const g = round();
    g.shield[0] = 1;
    g.energy[0] = 50;
    hold(g, 0, [Key.Weapon], 40);
    expect(g.shield[0]).toBe(0);
  });
});

describe('photon torpedoes', () => {
  test('one per press, 16 px ahead, 2 px a tick plus the ship, costing 1', () => {
    const g = round();
    hold(g, 0, [Key.Photon], 5);
    expect(g.state.slice(1, 8).filter((s) => s > 0).length).toBe(1);
    expect(g.energy[0]).toBe(126);
    expect(g.vx[1]).toBe(cos(0) * 4);
    expect(g.vy[1]).toBe(0);
  });

  test('at most 7 out at once', () => {
    const g = round();
    for (let n = 0; n < 10; n++) {
      hold(g, 0, [Key.Photon], 1);
      idle(g, 1);
    }
    expect(g.state.slice(1, 8).filter((s) => s > 0).length).toBe(7);
  });

  test('lives 640 ticks, then explodes for 64 passes', () => {
    const g = round();
    hold(g, 0, [Key.Photon], 1);
    // Slowed to half a pixel a tick so it cannot wrap round into a ship; it must
    // still move, since the main loop only checks a torpedo it has to redraw.
    g.vx[1] = F / 2;
    let ticks = 1;
    while (g.state[1] > 0 && ticks < 2000) { g.step(); ticks++; }
    expect(ticks).toBeGreaterThanOrEqual(625);
    expect(ticks).toBeLessThanOrEqual(641);
    let boom = 0;
    while (g.state[1] < 0) { g.step(); boom++; }
    // 64 passes; the first runs in the tick it died in.
    expect(boom).toBe(64 / PASSES_PER_TICK - 1);
  });

  test('your own torpedo costs you 4 shield', () => {
    const g = round();
    hold(g, 0, [Key.Photon], 1);
    g.px[1] = g.px[0];
    g.py[1] = g.py[0];
    g.vx[1] = 0;
    g.step();
    expect(g.shield[0]).toBe(27);
  });

  test('gravity bends them', () => {
    const g = round();
    g.options.gravity = true;
    hold(g, 0, [Key.Photon], 1);
    const v = g.vy[1];
    idle(g, 5);
    expect(g.vy[1]).not.toBe(v);
  });
});

describe('phasers', () => {
  test('a line from step 9 to 96 that shows 4 ticks and recharges in 20', () => {
    const g = round();
    g.angle[0] = 192;
    hold(g, 0, [Key.Phaser], 1);
    expect(g.phaserLine[0].length / 2).toBe(96 - 8);
    expect(g.energy[0]).toBe(126);
    let n = 0;
    while (g.phaserTimer[0] >= 0) { g.step(); n++; }
    expect(n).toBeGreaterThanOrEqual(23);
    expect(n).toBeLessThanOrEqual(25);
  });

  test('destroys a torpedo in its path and stops there', () => {
    const g = round();
    g.state[9] = 1;
    g.px[9] = (g.x(0) + 40) * F;
    g.py[9] = g.py[0];
    hold(g, 0, [Key.Phaser], 1);
    expect(g.state[9]).toBe(-1);
    expect(g.phaserLine[0].length / 2).toBeLessThan(40);
  });

  test('costs a ship 2 shield', () => {
    const g = round();
    g.px[8] = (g.x(0) + 50) * F;
    g.py[8] = g.py[0];
    hold(g, 0, [Key.Phaser], 1);
    expect(g.shield[1]).toBe(29);
  });
});

describe('hyperspace', () => {
  test('costs 8, gone 64 ticks, back still at a random point in range', () => {
    const g = round();
    hold(g, 0, [Key.Hyper], 1);
    expect(g.energy[0]).toBe(119);
    expect(g.state[0]).toBe(0);
    let n = 0;
    while (g.state[0] === 0) { g.step(); n++; }
    expect(n).toBe(63); // the 64th travel tick is the one the key was pressed in
    expect([g.vx[0], g.vy[0]]).toEqual([0, 0]);
    expect(g.x(0)).toBeGreaterThanOrEqual(0);
    expect(g.x(0)).toBeLessThan(640);
  });
});

describe('planet and gravity', () => {
  test('a ship inside 16 px of the planet loses 2 shield a pass', () => {
    const g = round();
    g.options.planet = true;
    g.px[0] = 319 * F;
    g.py[0] = 99 * F;
    g.pass();
    expect(g.shield[0]).toBe(29);
  });

  test('gravity pulls 8 * distance / 65536 a tick toward (319, 99)', () => {
    const g = round();
    g.options.gravity = true;
    g.step();
    expect(g.vx[0]).toBe(-8 * (160 - 319));
    expect(g.vy[0]).toBe(-8 * (46 - 99));
  });

  test('a torpedo touching the planet explodes', () => {
    const g = round();
    g.options.planet = true;
    hold(g, 0, [Key.Photon], 1);
    g.px[1] = 319 * F;
    g.py[1] = 99 * F;
    g.vx[1] = 0;
    g.step();
    expect(g.state[1]).toBe(-1);
  });
});

describe('screen edges', () => {
  test('wrap at x 8 and 632, y 8 and 192', () => {
    const g = round();
    g.px[0] = 631 * F;
    g.vx[0] = F;
    g.step();
    expect(g.x(0)).toBe(8);
    g.py[0] = 8 * F;
    g.vy[0] = -F;
    g.step();
    expect(g.y(0)).toBe(191);
  });
});

describe('collisions, death and the round', () => {
  test('ships touching swap halved velocities and part, without damage', () => {
    const g = round();
    g.px[8] = g.px[0] + 10 * F;
    g.py[8] = g.py[0];
    g.vx[0] = 2 * F;
    g.vx[8] = -4 * F;
    g.pass();
    expect(g.vx[0]).toBe(-2 * F);
    expect(g.vx[8]).toBe(F);
    expect(g.shield).toEqual([31, 31]);
  });

  test('torpedoes from each side destroy each other', () => {
    const g = round();
    for (const t of [1, 9]) { g.state[t] = 1; g.px[t] = 300 * F; g.py[t] = 150 * F; g.energy[t] = 40; }
    g.step();
    expect([g.state[1], g.state[9]]).toEqual([-1, -1]);
  });

  test('a shield below 0 explodes the ship, scores the other side and ends the round', () => {
    const g = round();
    g.shield[1] = -1;
    g.step();
    expect(g.wins).toEqual([1, 0]);
    expect(g.explosion).not.toBeNull();
    let n = 0;
    let r: string = 'play';
    while (r === 'play' && n < 2000) { r = g.step(); n++; }
    expect(r).toBe('round-over');
    expect(n).toBe(EXPLOSION_FRAMES * EXPLOSION_TICKS_PER_FRAME + EXPLOSION_HOLD_TICKS);
  });
});

describe('bars and stars', () => {
  test('the S and E bars are as long as the values, from x 24 and x 615', () => {
    const g = round();
    g.step();
    const run = (y: number, x: number, d: number) => { let n = 0; while (g.screen.px[y * 640 + x + n * d]) n++; return n; };
    expect(run(184, 24, 1)).toBe(31);
    expect(run(192, 24, 1)).toBe(127);
    expect(run(184, 615, -1)).toBe(31);
    expect(run(192, 615, -1)).toBe(127);
  });

  test('512 stars, all inside [8, 632) x [8, 192)', () => {
    const g = new Game(3);
    g.stars();
    let n = 0;
    for (let i = 0; i < g.screen.px.length; i++) {
      if (!g.screen.px[i]) continue;
      n++;
      const x = i % 640;
      const y = Math.floor(i / 640);
      expect(x >= 8 && x < 632 && y >= 8 && y < 192).toBe(true);
    }
    expect(n).toBeGreaterThan(480);
    expect(n).toBeLessThanOrEqual(512);
  });
});

describe('sound', () => {
  test('the phaser rises from divisor 1984 to 1024 over 16 ticks', () => {
    const g = round();
    g.soundOn = true;
    g.angle[0] = 192;
    hold(g, 0, [Key.Phaser], 1);
    const seen: number[] = [];
    for (let n = 0; n < 20; n++) { if (g.speaker.on) seen.push(g.speaker.divisor); g.step(); }
    expect(seen[0]).toBe(1984);
    expect(seen).toContain(1024);
    expect(g.speaker.on).toBe(false);
  });

  test('a photon is divisor 128 for 2 ticks', () => {
    const g = round();
    g.soundOn = true;
    hold(g, 0, [Key.Photon], 1);
    expect(g.speaker).toEqual({ on: true, divisor: 128 });
    idle(g, 2);
    expect(g.speaker.on).toBe(false);
  });

  test('the warning swaps 1024 and 2048 below 16 shield; sound off is silent', () => {
    const g = round();
    g.soundOn = true;
    g.shield[0] = 10;
    const seen = new Set<number>();
    for (let n = 0; n < 200; n++) { g.step(); if (g.speaker.on) seen.add(g.speaker.divisor); }
    expect([...seen].sort()).toEqual([1024, 2048]);
    g.soundOn = false;
    g.step();
    expect(g.speaker.on).toBe(false);
  });
});

describe('robots', () => {
  test('aim points at the target by octant', () => {
    expect(Game.aim(10, 0)).toBe(0);
    expect(Game.aim(0, 10)).toBe(64);
    expect(Game.aim(-10, 0)).toBe(128);
    expect(Game.aim(0, -10)).toBe(192);
    expect(Game.aim(10, 10)).toBe(32);
  });

  test('the defensive robot turns on a nearby torpedo and fires its phaser', () => {
    const g = round();
    g.options.robot[0] = true;
    g.state[9] = 1;
    g.px[9] = (g.x(0) + 50) * F;
    g.py[9] = g.py[0] + 50 * F;
    g.energy[9] = 40;
    g.step();
    expect(g.angle[0]).toBe(32);
    expect(g.phaserTimer[0]).toBeGreaterThan(0);
  });

  test('the offensive robot always faces the left ship', () => {
    const g = round();
    g.options.robot[1] = true;
    g.step();
    expect(g.angle[8]).toBe(Game.aim(g.x(0) - g.x(8), g.y(0) - g.y(8)));
  });
});
