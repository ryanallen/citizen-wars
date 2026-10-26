import { expect, test } from 'vitest';
import { Online, type Target } from './online';
import { retryWait, handshakeRelays } from './net/config';
import type { Client, Outcome } from './net/session';
import type { Note } from './net/lobby';

const note = (system: string, host: string): Note => ({ system, host, players: 1, cap: 2, members: [host], at: 0 });

/** An Online whose relays are stubbed: it sees two open systems and fails sol until told otherwise. */
class Stubbed extends Online {
  tries: string[] = [];
  waits: number[] = [];
  joinable = new Set<string>();
  joined: string | null = null;

  constructor() {
    const waits: number[] = [];
    super({ relays: { notes: [], all: ['a', 'b', 'c', 'd'] }, callsign: 'T-1', wait: async (ms) => { waits.push(ms); } });
    this.waits = waits;
  }

  protected async choose(): Promise<Target[]> {
    return [{ system: 'sol', note: note('sol', 'h1') }, { system: 'alpha-centauri', note: note('alpha-centauri', 'h2') }];
  }

  protected async tryJoin(t: Target): Promise<{ outcome: Outcome; client: Client | null }> {
    this.tries.push(t.system);
    if (!this.joinable.has(t.system)) return { outcome: 'failed', client: null };
    return { outcome: 'joined', client: { system: t.system } as Client };
  }

  protected becomeClient(client: Client): void {
    this.joined = client.system;
  }
}

test('retries wait 1, 2, 4, 8, then every 15 seconds, for ever', () => {
  expect([0, 1, 2, 3, 4, 5, 50].map(retryWait)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
});

test('after the third failure on a system, the next open one is tried alongside and the first in wins', async () => {
  const o = new Stubbed();
  o.joinable.add('alpha-centauri');
  o.start();
  for (let n = 0; n < 50 && !o.joined; n++) await new Promise((r) => setTimeout(r, 5));
  expect(o.tries.slice(0, 3)).toEqual(['sol', 'sol', 'sol']);
  expect(o.tries.slice(3)).toEqual(expect.arrayContaining(['sol', 'alpha-centauri']));
  expect(o.joined).toBe('alpha-centauri');
  expect(o.waits).toEqual([1000, 2000, 4000]);
});

test('handshake relays are picked by system and move on with each shift', () => {
  const list = { notes: [], all: ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'] };
  const a = handshakeRelays(list, 'sol');
  expect(a).toEqual(handshakeRelays(list, 'sol'));
  expect(a.length).toBe(3);
  expect(handshakeRelays(list, 'sol', 1)).not.toEqual(a);
});

test('a new call sign reaches the host or client in play at once', () => {
  const o = new Stubbed();
  const got: string[] = [];
  o.phase = { kind: 'client', client: { setCallsign: (c: string) => got.push(`client ${c}`) } as unknown as Client };
  o.callsign = 'NEW-1';
  o.phase = { kind: 'host', host: { setCallsign: (c: string) => got.push(`host ${c}`) } as never };
  o.callsign = 'NEW-2';
  expect(got).toEqual(['client NEW-1', 'host NEW-2']);
  expect(o.callsign).toBe('NEW-2');
});

test('a host gives its system up only to a claimant that lets it in', async () => {
  const o = new Stubbed();
  let stopped = 0;
  const host = { stop: () => { stopped++; } } as never;
  o.phase = { kind: 'host', host };
  const yieldTo = (o as unknown as { yieldTo(h: unknown, s: string, w: string): Promise<void> }).yieldTo.bind(o);
  // A note no host stands behind: tried, not answered, kept.
  await yieldTo(host, 'sol', '0000fake');
  expect([o.tries, stopped, o.phase.kind, o.joined]).toEqual([['sol'], 0, 'host', null]);
  // A real host that keeps the system: joined, and this one stops hosting.
  o.joinable.add('sol');
  await yieldTo(host, 'sol', '0000real');
  expect([stopped, o.joined]).toEqual([1, 'sol']);
});
