// Two players in two browser sessions, through the real relays.
// Usage: node scripts/net-check.mjs <scenario>
//   join      A hosts, B joins the same system with no typing; B's keys move B's ship on A.
//   link      A hosts; B opens A's address and lands in the same system.
//   offline   B's network drops for 60 s and B rejoins the same match on its own.
//   hide      A (the host) hides its tab: the match carries on with B as host.
//   pilot     a test pilot joins a match under way.
import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://localhost:5199/citizen-wars/';
const scenario = process.argv[2] ?? 'join';
const browser = await chromium.launch({ channel: 'msedge' });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function player(name, address = url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(name, 'pageerror', e.message));
  await page.goto(address);
  return { name, ctx, page };
}

const state = (p) => p.page.evaluate(() => {
  const o = window.citizenWarsOnline?.();
  if (!o) return null;
  const v = o.view();
  return {
    phase: o.phase.kind, attempt: o.phase.attempt ?? 0, system: o.system, side: v.side, players: v.roster.length,
    ships: [[v.game.x(0), v.game.y(0), v.game.angle[0]], [v.game.x(8), v.game.y(8), v.game.angle[8]]],
    hash: location.hash, log: o.log.slice(-3),
    acks: o.phase.kind === 'host' ? [...o.phase.host.members.values()].map((m) => [m.ack, m.input.keys, m.side]) : null,
    seq: o.phase.kind === 'client' ? o.phase.client.seq : null, mode: window.citizenWarsMode(),
  };
});

async function until(p, test, ms, what) {
  const t0 = Date.now();
  for (;;) {
    const s = await state(p);
    if (s && test(s)) return s;
    if (Date.now() - t0 > ms) throw new Error(`${p.name}: no ${what} after ${ms} ms: ${JSON.stringify(s)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

let ok = false;
try {
  const a = await player('A');
  const sa = await until(a, (s) => s.phase === 'host', 30000, 'hosting');
  log('A hosts', sa.system, sa.hash);
  if (scenario === 'pilot') {
    // A plays the robot for a while, then a test pilot joins the match under way.
    await a.page.keyboard.down('KeyS');
    await new Promise((r) => setTimeout(r, 5000));
    await a.page.keyboard.up('KeyS');
    const pilotPage = await player('PILOTS', `${url}test.html?pilots=1`);
    const t0 = Date.now();
    let rows = [];
    while (Date.now() - t0 < 60000) {
      rows = await pilotPage.page.evaluate(() => window.pilots.map((p) => ({ phase: p.phase.kind, system: p.system, log: p.log.slice(-3) })));
      if (rows[0]?.phase === 'client') break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const host = await state(a);
    log('pilot', JSON.stringify(rows), 'A players', host.players);
    ok = rows[0]?.phase === 'client' && rows[0].system === sa.system && host.players === 2;
  } else {
    const b = await player('B', scenario === 'link' ? `${url}${sa.hash}` : url);
    const sb = await until(b, (s) => s.phase === 'client', 60000, 'joining');
    log('B joined', sb.system, 'side', sb.side, sb.log);
    if (sb.system !== sa.system) throw new Error('different systems');
    // B's keys reach A: the host holds B's D key while B holds it. (Whether the
    // ship then turns depends on the game: a ship dying on the planet does not.)
    await b.page.keyboard.down('KeyD');
    await new Promise((r) => setTimeout(r, 700));
    const held = (await state(a)).acks?.[0]?.[1] ?? 0;
    await b.page.keyboard.up('KeyD');
    await new Promise((r) => setTimeout(r, 300));
    const sa2 = await state(a);
    const sb2 = await state(b);
    log('A holds B input', held, 'acks', JSON.stringify(sa2.acks), 'B seq', sb2.seq, 'same ships', JSON.stringify(sa2.ships) === JSON.stringify(sb2.ships));
    if (!(held & 1)) throw new Error('B keys did not reach A');
    if (scenario === 'offline') {
      await b.ctx.setOffline(true);
      log('B offline');
      await new Promise((r) => setTimeout(r, 60000));
      await b.ctx.setOffline(false);
      log('B online');
      const back = await until(b, (s) => s.phase === 'client' && s.system === sa.system, 120000, 'rejoining');
      log('B rejoined', back.system, back.log);
    }
    if (scenario === 'hide') {
      await a.page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const nb = await until(b, (s) => s.phase === 'host' && s.system === sa.system, 30000, 'taking over');
      log('B hosts after hand-over', nb.system, nb.log);
      await a.page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const na = await until(a, (s) => s.phase === 'client' && s.system === sa.system, 60000, 'rejoining');
      log('A back as a player', na.system, na.log);
    }
    ok = true;
  }
} catch (e) {
  log('FAIL', e.message);
} finally {
  await browser.close();
  log(ok ? 'PASS' : 'FAIL', scenario);
  process.exit(ok ? 0 : 1);
}
