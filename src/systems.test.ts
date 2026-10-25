import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game, fieldSize, EXPLOSION_TICKS } from './sim/game';
import { skyFrom } from './sky';
import { saveWorld, gameFor } from './sim/snapshot';
import { drawWorld } from './scene';
import { Screen } from './screen';
import { keeps } from './net/lobby';
import type { StarSystem } from './systems';

const systems: StarSystem[] = JSON.parse(readFileSync('public/systems.json', 'utf8')).systems;
const skyBytes = readFileSync('public/sky.bin');
const sky = new Float32Array(skyBytes.buffer, skyBytes.byteOffset, skyBytes.byteLength / 4);

describe('systems.json', () => {
  test('every system near Sol, nearest first, from Sol', () => {
    expect(systems.length).toBeGreaterThan(1000);
    expect(systems[0].id).toBe('sol');
    for (let n = 1; n < systems.length; n++) expect(systems[n].ly).toBeGreaterThanOrEqual(systems[n - 1].ly);
    expect(systems.map((s) => s.id).slice(0, 3)).toEqual(['sol', 'alpha-centauri', 'barnards-star']);
  });

  test('address names are unique and fit an address', () => {
    const ids = systems.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test('every star has a mass and radius', () => {
    for (const s of systems) for (const st of s.stars!) { expect(st.mass).toBeGreaterThan(0); expect(st.radius).toBeGreaterThan(0); }
    expect(systems[1].stars!.length).toBe(3); // Rigil Kentaurus, Toliman, Proxima
  });
});

describe('a system\'s star', () => {
  test('Sol is the DOS planet exactly', () => {
    const g = new Game(1);
    g.setStars(systems[0].stars!);
    expect(g.bodies).toEqual([{ x: 319, y: 99, pull: 8, box: 16, scale: 1 }]);
  });

  test('other stars scale size and pull, held in range, each star its own body', () => {
    const g = new Game(1);
    const sirius = systems.find((s) => s.id === 'sirius')!;
    g.setStars(sirius.stars!);
    expect(g.bodies.length).toBe(2);
    expect(g.bodies[0].scale).toBe(2); // 2.19 Suns across, held at 2
    expect(g.bodies[0].pull).toBe(17); // 2.18 Suns of mass
    expect(g.bodies[1].scale).toBe(0.5); // the white dwarf, held at a half
    const wolf = systems.find((s) => s.id === 'wolf-359')!;
    g.setStars(wolf.stars!);
    expect(g.bodies[0].pull).toBe(2); // a tenth of a Sun, held at a quarter
  });
});

describe('the sky', () => {
  test('512 stars on the screen, and Barnard\'s sky is not Sol\'s', () => {
    const sol = skyFrom(sky, systems[0].xyz!);
    const barnard = skyFrom(sky, systems[2].xyz!);
    expect(sol.length).toBe(512);
    for (const [x, y] of sol) { expect(x).toBeGreaterThanOrEqual(8); expect(x).toBeLessThan(632); expect(y).toBeGreaterThanOrEqual(8); expect(y).toBeLessThan(192); }
    // The far, bright stars barely move: many are within a pixel of where they were; the near ones are not.
    const within = barnard.filter(([x, y]) => sol.some(([u, v]) => Math.abs(u - x) <= 1 && Math.abs(v - y) <= 1)).length;
    expect(within).toBeLessThan(512);
    expect(within).toBeGreaterThan(100);
  });
});

describe('many ships', () => {
  function system(n: number, rules: 'respawn' | 'last-standing' = 'respawn'): Game {
    const g = new Game(5, undefined, 16);
    g.rules = rules;
    g.options = { planet: true, gravity: true, robot: Array(16).fill(true) };
    for (let s = 0; s < n; s++) g.present[s] = true;
    const { w, h } = fieldSize(n);
    g.setField(w, h);
    g.startRound();
    return g;
  }

  test('the field grows √(n/2) each way; two ships keep the DOS screen', () => {
    expect(fieldSize(2)).toEqual({ w: 640, h: 200 });
    expect(fieldSize(8)).toEqual({ w: 1280, h: 400 });
    expect(fieldSize(16).w).toBeGreaterThan(1800);
  });

  test('two ships start where the DOS game puts them; more start round the star', () => {
    const g = new Game(1, undefined, 16);
    expect([g.startPoint(0, 2), g.startPoint(1, 2)]).toEqual([[160, 46, 0], [480, 138, 128]]);
    const big = system(8);
    const points = new Set(Array.from({ length: 8 }, (_, n) => big.startPoint(n, 8).slice(0, 2).join(',')));
    expect(points.size).toBe(8);
  });

  test('a ship arriving starts at the freest point; one leaving takes its torpedoes with it', () => {
    const g = system(3);
    g.arrive(5);
    expect(g.alive(g.ship(5))).toBe(true);
    g.leave(5);
    for (let i = 40; i < 48; i++) expect(g.state[i]).toBe(0);
  });

  test('with respawn, a destroyed ship comes back after its explosion and its killer scores', () => {
    const g = system(3);
    g.options.robot[1] = false; // a robot would move energy into its shield first
    g.lastHit[1] = 2;
    g.shield[1] = -1;
    g.step();
    expect(g.alive(g.ship(1))).toBe(false);
    expect(g.kills[2]).toBe(1);
    for (let n = 0; n < EXPLOSION_TICKS; n++) g.step();
    expect(g.alive(g.ship(1))).toBe(true);
    expect(g.shield[1]).toBe(31);
  });

  test('with last ship standing, the round ends when one is left', () => {
    const g = system(3, 'last-standing');
    g.options.robot[0] = false;
    g.options.robot[1] = false;
    g.shield[0] = -1;
    g.shield[1] = -1;
    let r = 'play';
    for (let n = 0; n < EXPLOSION_TICKS + 5 && r === 'play'; n++) r = g.step();
    expect(r).toBe('round-over');
    expect(g.wins[2]).toBe(1);
  });

  test('sixteen robots fly a world that saves, loads and plays on the same', () => {
    const a = system(16);
    for (let n = 0; n < 300; n++) a.step();
    const bytes = saveWorld(a);
    const b = gameFor(bytes);
    b.options.robot = Array(16).fill(true);
    for (let n = 0; n < 300; n++) { a.step(); b.step(); }
    expect(saveWorld(b)).toEqual(saveWorld(a));
  });

  test('a 16-ship world stays small enough to send 30 times a second', () => {
    const a = system(16);
    for (let n = 0; n < 500; n++) a.step();
    expect(saveWorld(a).length).toBeLessThan(2500);
  });

  test('zoomed out, every ship and the star are on screen', () => {
    const g = system(16);
    for (let n = 0; n < 200; n++) g.step();
    const s = new Screen();
    drawWorld(g, s, { me: 0, sky: [] });
    let lit = 0;
    for (const p of s.px) lit += p;
    expect(lit).toBeGreaterThan(200);
  });
});

describe('two hosts on one system', () => {
  test('the one whose key sorts lower keeps it', () => {
    expect(keeps('02ab', 'f1')).toBe('02ab');
    expect(keeps('f1', '02ab')).toBe('02ab');
  });
});
