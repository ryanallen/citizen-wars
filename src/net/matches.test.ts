import { expect, test } from 'vitest';
import { MATCH_MS, PLAYFIELDS, matchAt, msLeft, playfieldFor } from './matches';

const key = (p: { planet: boolean; gravity: boolean }) => PLAYFIELDS.findIndex((q) => q.planet === p.planet && q.gravity === p.gravity);

test('every four matches deal all four playfields, never one twice in a row', () => {
  for (const system of ['sol', 'barnards-star', 'alpha-centauri']) {
    const run = Array.from({ length: 400 }, (_, m) => key(playfieldFor(system, m)));
    for (let d = 0; d < 400; d += 4) expect(new Set(run.slice(d, d + 4)).size).toBe(4);
    for (let m = 1; m < run.length; m++) expect(run[m]).not.toBe(run[m - 1]);
  }
});

test('systems deal their own orders', () => {
  const order = (s: string) => Array.from({ length: 16 }, (_, m) => key(playfieldFor(s, m))).join('');
  expect(order('sol')).not.toBe(order('barnards-star'));
});

test('the same match on any clock in it, and the time left', () => {
  expect(matchAt(5 * MATCH_MS + 1)).toBe(matchAt(6 * MATCH_MS - 1));
  expect(msLeft(5 * MATCH_MS + 1000)).toBe(MATCH_MS - 1000);
});
