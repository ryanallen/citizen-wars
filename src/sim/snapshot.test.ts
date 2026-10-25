import { expect, test } from 'vitest';
import { Game, Key } from './game';
import { keysInput } from './input';
import { saveWorld, loadWorld } from './snapshot';
import { drawWorld } from '../scene';
import { Screen } from '../screen';

function busy(seed: number): Game {
  const g = new Game(seed);
  // Worlds are sent only online, under the online rules.
  g.rules = 'respawn';
  g.options = { planet: true, gravity: true, robot: [true, true] };
  g.startRound();
  for (let n = 0; n < 400; n++) g.step();
  return g;
}

test('a saved world, loaded elsewhere, plays on exactly the same', () => {
  const a = busy(31);
  const b = new Game(999);
  b.options.robot = [true, true];
  loadWorld(b, saveWorld(a));
  for (let n = 0; n < 600; n++) {
    a.step();
    b.step();
  }
  expect(saveWorld(b)).toEqual(saveWorld(a));
});

test('a world fits in a packet: under 1 KB without particles', () => {
  const g = new Game(5);
  g.startRound();
  expect(saveWorld(g).length).toBeLessThan(1024);
});

test('a client that loads the host world and re-runs its own keys matches the host', () => {
  const host = busy(8);
  host.options.robot = [false, true];
  const client = new Game(1);
  client.options.robot = [false, true];
  const keys = [keysInput(1 << Key.CW), keysInput(1 << Key.Impulse), keysInput(1 << Key.Photon), keysInput(0)];
  const world = saveWorld(host);
  for (let n = 0; n < 40; n++) {
    host.inputs[0] = keys[n % 4];
    host.step();
  }
  loadWorld(client, world);
  for (let n = 0; n < 40; n++) {
    client.inputs[0] = keys[n % 4];
    client.step();
  }
  expect(saveWorld(client)).toEqual(saveWorld(host));
});

test('drawing a world from state shows the ships and bars', () => {
  const g = new Game(2);
  g.startRound();
  g.step();
  const s = new Screen();
  drawWorld(g, s, { callsigns: { 0: 'RED-7' } });
  let ship = 0;
  for (let y = 38; y < 54; y++) for (let x = 152; x < 168; x++) ship += s.px[y * 640 + x];
  expect(ship).toBeGreaterThan(10);
  let bar = 0;
  while (s.px[192 * 640 + 24 + bar]) bar++;
  expect(bar).toBe(127);
});
