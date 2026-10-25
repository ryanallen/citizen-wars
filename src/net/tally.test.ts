import { expect, test } from 'vitest';
import { Identity, type Filter, type NostrEvent, type Pool } from './nostr';
import { MATCH_TAG, countMatches, matchEvent } from './tally';
import { Host } from './session';
import { MATCH_MS } from './matches';
import { NO_INPUT } from '../sim/input';

/** A pool holding these events, answering with at most `cap` a query, newest first, as relays do. */
function fakePool(events: NostrEvent[], cap: number, open = 1) {
  return {
    connect: async () => Array(open).fill({}),
    subscribe(filters: Filter[], onEvent: (e: NostrEvent) => void, onEose?: () => void) {
      const f = filters[0];
      events.filter((e) => e.tags.some((t) => t[0] === 't' && t[1] === MATCH_TAG) && (f.until === undefined || e.created_at <= f.until))
        .sort((a, b) => b.created_at - a.created_at).slice(0, Math.min(cap, f.limit ?? cap)).forEach(onEvent);
      onEose?.();
      return () => {};
    },
  } as unknown as Pool;
}

const at = (e: NostrEvent, t: number): NostrEvent => ({ ...e, created_at: t });

test('a match is counted once however many hosts wrote it, across pages', async () => {
  const a = Identity.random();
  const b = Identity.random();
  const events: NostrEvent[] = [];
  for (let m = 0; m < 30; m++) events.push(at(await matchEvent(a, 'sol', m, 2), 1000 + m));
  // A second host after a hand-over writes three of the same matches again, and one more system.
  for (let m = 27; m < 30; m++) events.push(at(await matchEvent(b, 'sol', m, 3), 1000 + m));
  events.push(at(await matchEvent(b, 'alpha-centauri', 5, 2), 1010));
  expect(await countMatches(fakePool(events, 7), 50)).toBe(31);
});

test('no relay answering counts nothing, not zero', async () => {
  expect(await countMatches(fakePool([], 7, 0), 50)).toBeNull();
  expect(await countMatches(fakePool([], 7), 50)).toBe(0);
});

test('a host writes a match only when two or more people flew in it', () => {
  let clock = 10 * MATCH_MS;
  const host = new Host({ system: 'sol', me: Identity.random(), relays: { notes: [], all: ['x'] }, callsign: 'T-1', now: () => clock });
  const written: [number, number][] = [];
  (host as unknown as { publishMatch: (m: number, p: number) => void }).publishMatch = (m, p) => { written.push([m, p]); };
  host.tick(NO_INPUT);
  clock += MATCH_MS;
  host.tick(NO_INPUT);
  expect(written).toEqual([]);
  // Someone joins for a moment in match 11 and leaves before it ends: still a real match.
  host.members.set('k', { pubkey: 'k', callsign: 'T-2', side: 1, joined: 0, input: NO_INPUT, ack: 0, peer: null, via: null });
  host.tick(NO_INPUT);
  host.members.delete('k');
  clock += MATCH_MS;
  host.tick(NO_INPUT);
  expect(written).toEqual([[11, 2]]);
});
