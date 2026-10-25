// Against real public relays: run with npm run test:live.
import { expect, test } from 'vitest';
import { Identity, Relay, now, verify, type NostrEvent } from './nostr';
import { CANDIDATES } from './relay-candidates';

interface Row { url: string; open: boolean; stored: boolean; ephemeral: boolean; ms: number }

test('which relays answer, store a note, and pass an ephemeral message', async () => {
  const me = Identity.random();
  const them = Identity.random();
  const rows: Row[] = await Promise.all(CANDIDATES.map(async (url): Promise<Row> => {
    const t0 = Date.now();
    const a = new Relay(url, 5000);
    const b = new Relay(url, 5000);
    try {
      await Promise.all([a.connect(), b.connect()]);
    } catch {
      return { url, open: false, stored: false, ephemeral: false, ms: Date.now() - t0 };
    }
    const tag = `cw-check-${Math.random().toString(36).slice(2)}`;
    // Ephemeral: b listens, a sends to b.
    const heard = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      b.subscribe([{ kinds: [25050], '#p': [them.pubkey], since: now() - 5 }], (e) => {
        if (e.tags.some((t) => t[1] === tag)) { clearTimeout(timer); resolve(true); }
      });
    });
    await new Promise((r) => setTimeout(r, 400));
    await a.publish(await me.sign({ kind: 25050, tags: [['p', them.pubkey], ['t', tag]], content: 'hello' }));
    const ephemeral = await heard;
    // Stored: a note with an expiry, read back by b.
    const note = await me.sign({ kind: 30078, tags: [['d', tag], ['t', 'citizen-wars-check'], ['expiration', String(now() + 60)]], content: '{}' });
    const ok = await a.publish(note);
    const stored = ok && await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      b.subscribe([{ kinds: [30078], authors: [me.pubkey], '#d': [tag] }], (e: NostrEvent) => {
        if (e.id === note.id) { clearTimeout(timer); resolve(true); }
      }, () => {});
    });
    a.disconnect();
    b.disconnect();
    return { url, open: true, stored, ephemeral, ms: Date.now() - t0 };
  }));
  console.table(rows);
  expect(rows.filter((r) => r.stored && r.ephemeral).length).toBeGreaterThanOrEqual(3);
});

test('our signatures verify', async () => {
  const me = Identity.random();
  const e = await me.sign({ kind: 1, tags: [], content: 'x' });
  expect(await verify(e)).toBe(true);
  expect(await verify({ ...e, content: 'y' })).toBe(false);
});
