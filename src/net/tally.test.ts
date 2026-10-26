import { expect, test } from 'vitest';
import { Identity, type Filter, type NostrEvent, type Pool } from './nostr';
import { GAME_TAG, SITE_BORN, countKills, killsEvent, mostKills } from './tally';
import { Host } from './session';
import { NO_INPUT, keysInput } from '../sim/input';
import { gameClock } from '../start';

/** A pool holding these events, answering with at most `cap` a query, newest first, as relays do. */
function fakePool(events: NostrEvent[], cap: number, open = 1) {
  return {
    connect: async () => Array(open).fill({}),
    subscribe(filters: Filter[], onEvent: (e: NostrEvent) => void, onEose?: () => void) {
      const f = filters[0];
      events.filter((e) => e.tags.some((t) => t[0] === 't' && t[1] === GAME_TAG) && (f.until === undefined || e.created_at <= f.until))
        .sort((a, b) => b.created_at - a.created_at).slice(0, Math.min(cap, f.limit ?? cap)).forEach(onEvent);
      onEose?.();
      return () => {};
    },
  } as unknown as Pool;
}

const at = (e: NostrEvent, t: number): NostrEvent => ({ ...e, created_at: t });

test('each game counts its highest kills once, whichever host wrote them, across pages', async () => {
  const a = Identity.random();
  const b = Identity.random();
  const events: NostrEvent[] = [];
  // Twenty games of 3 kills each, every one written as it rose: 1, 2, 3.
  const T = SITE_BORN;
  for (let g = 0; g < 20; g++) for (let k = 1; k <= 3; k++) events.push(at(await killsEvent(a, 'sol', T + g, k), T + 1000 + g * 3 + k));
  // A host taking over game 19 carries its 3 kills and adds 2 more.
  events.push(at(await killsEvent(b, 'sol', T + 19, 5), T + 2000));
  events.push(at(await killsEvent(b, 'alpha-centauri', T + 700, 4), T + 2001));
  expect(await countKills(fakePool(events, 7), 50)).toBe(19 * 3 + 5 + 4);
});

test('no relay answering counts nothing, not zero', async () => {
  expect(await countKills(fakePool([], 7, 0), 50)).toBeNull();
  expect(await countKills(fakePool([], 7), 50)).toBe(0);
});

test('a game begins at the first key: before it, no clock and nothing written', () => {
  let clock = 1_000_000;
  const host = new Host({ system: 'sol', me: Identity.random(), relays: { notes: [], all: ['x'] }, callsign: 'T-1', now: () => clock });
  const written: [number, number][] = [];
  (host as unknown as { publishKills: (b: number, k: number) => void }).publishKills = (b, k) => { written.push([b, k]); };
  const g = host.game;
  // The tab idles behind the start screen while the robot kills its empty ship.
  for (let n = 0; n < 100; n++) host.tick(NO_INPUT);
  g.kills[1] = 4;
  clock += 20000;
  host.tick(NO_INPUT);
  expect([g.elapsed, g.born, written]).toEqual([0, 0, []]);
  // A key: the game is born, its clock runs, and its kills are written.
  host.tick(keysInput(1));
  expect(g.born).toBe(1020);
  host.tick(NO_INPUT);
  expect(g.elapsed).toBe(2);
  expect(written).toEqual([[1020, 4]]);
  // Rewritten only once kills change, and at most every ten seconds.
  g.kills[0] = 1;
  host.tick(NO_INPUT);
  clock += 10000;
  host.tick(NO_INPUT);
  expect(written).toEqual([[1020, 4], [1020, 5]]);
});

test('the game clock reads M:SS, and H:MM:SS from an hour', () => {
  expect([0, 59.9, 61, 3599, 3600, 3725].map(gameClock)).toEqual(['0:00', '0:59', '1:01', '59:59', '1:00:00', '1:02:05']);
});

test('a note counts no more kills than its game could have made', async () => {
  const a = Identity.random();
  const T = SITE_BORN + 86400;
  // Twelve ships each dying once per explosion: two kills a second, and a start of twelve.
  expect([mostKills(T, T), mostKills(T, T + 60), mostKills(T - 86400 * 365, T), mostKills(T + 3600, T)]).toEqual([12, 132, 0, 0]);
  const events = [
    at(await killsEvent(a, 'sol', T, 999999999), T + 60), // a minute old: 132 at most
    at(await killsEvent(a, 'sol', 1000, 50), T), // before the site
    at(await killsEvent(a, 'vega', T + 3600, 50), T), // an hour in the future
  ];
  expect(await countKills(fakePool(events, 7), 50)).toBe(132);
});
