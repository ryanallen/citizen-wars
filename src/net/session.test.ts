import { expect, test } from 'vitest';
import { Host } from './session';
import { Identity } from './nostr';
import type { Peer } from './peer';

/** A host with no relays, and members joined directly through stub connections. */
function hostWith(...keys: string[]) {
  const host = new Host({ system: 'sol', me: Identity.random(), relays: { notes: [], all: [] }, callsign: 'HOST' });
  const h = host as unknown as {
    add(m: object): void;
    message(from: string, ch: 'reliable' | 'fast', d: string): void;
  };
  keys.forEach((pubkey, n) => {
    const peer = { send: () => {}, close: () => {} } as unknown as Peer;
    h.add({ pubkey, callsign: pubkey.toUpperCase(), side: n + 1, joined: n, input: { keys: 0, aim: 0 }, ack: 0, peer, via: null });
  });
  const say = (from: string, c: object) => h.message(from, 'reliable', JSON.stringify(c));
  const relayed = (from: string, as: string, c: object) => say(from, { t: 'relayed', from: as, data: 's' + btoa(JSON.stringify(c)) });
  return { host, say, relayed };
}

test('a member cannot speak for another member', () => {
  const { host, relayed } = hostWith('a', 'b');
  relayed('a', 'b', { t: 'bye' });
  relayed('a', 'b', { t: 'hello', callsign: 'FAKE', pubkey: 'b' });
  expect(host.members.get('b')?.callsign).toBe('B');
});

test('a member speaks for the one whose traffic it passes', () => {
  const { host, say, relayed } = hostWith('a');
  say('a', { t: 'relay-for', pubkey: 'c', callsign: 'C' });
  relayed('a', 'c', { t: 'hello', callsign: 'CEE', pubkey: 'c' });
  expect(host.members.get('c')?.callsign).toBe('CEE');
  relayed('a', 'c', { t: 'bye' });
  expect(host.members.has('c')).toBe(false);
});

test('a member cannot take over another by passing traffic for it', () => {
  const { host, say } = hostWith('a', 'b');
  say('a', { t: 'relay-for', pubkey: 'b', callsign: 'B' });
  say('a', { t: 'relay-for', pubkey: host.pubkey, callsign: 'X' });
  expect(host.members.get('b')?.via).toBe(null);
  expect(host.members.has(host.pubkey)).toBe(false);
});

test('a member who leaves after being hit dies on the host, and the hitter scores', () => {
  const { host } = hostWith('a');
  const g = host.game;
  const side = host.members.get('a')!.side;
  g.lastHit[side] = host.side;
  g.shield[side] = 3; g.energy[g.ship(side)] = 0;
  host.remove('a');
  expect(g.kills[host.side]).toBe(1);
  // Alone, the host gets the robot on that side: a fresh ship, not the one that fled.
  expect(g.options.robot[side]).toBe(true);
  expect([g.shield[side], g.energy[g.ship(side)], g.deaths[side]]).toEqual([31, 127, 0]);
});

test('the robot standing in steps aside for a person without scoring anyone', () => {
  const { host } = hostWith();
  const g = host.game;
  const robot = g.options.robot.indexOf(true);
  g.lastHit[robot] = host.side;
  const h = host as unknown as { add(m: object): void };
  h.add({ pubkey: 'p', callsign: 'P', side: 1, joined: 0, input: { keys: 0, aim: 0 }, ack: 0, peer: { send() {}, close() {} }, via: null });
  expect(g.kills[host.side]).toBe(0);
});
