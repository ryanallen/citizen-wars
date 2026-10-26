// Fly N test pilots into one system and measure the host (ticket, Phase 4).
// Usage: node scripts/load-check.mjs <N> [system]
// Reports how many joined, the host's upload and worlds a second, and the clients' worlds a second.
import { chromium } from 'playwright';

const n = Number(process.argv[2] ?? 4);
const system = process.argv[3] ?? `load-${Date.now() % 100000}`;
const url = process.env.URL ?? 'http://localhost:5199/';
const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${url}test.html?pilots=${n}&system=${system}&stagger=300`);

const read = () => page.evaluate(() => window.pilots.map((p) => {
  const ph = p.phase;
  return {
    kind: ph.kind, system: p.system,
    sent: ph.kind === 'host' ? ph.host.sentBytes : 0, worlds: ph.kind === 'host' ? ph.host.worldsOut : 0,
    members: ph.kind === 'host' ? ph.host.members.size : 0,
    seen: ph.kind === 'client' ? ph.client.worldsIn : 0,
  };
}));

const t0 = Date.now();
let rows = [];
while (Date.now() - t0 < 90000) {
  rows = await read();
  const host = rows.find((r) => r.kind === 'host' && r.members > 0);
  if (rows.length === n && host && host.members === n - 1) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const joinedAt = (Date.now() - t0) / 1000;
const a = await read();
const ta = Date.now();
await new Promise((r) => setTimeout(r, 20000));
const b = await read();
const secs = (Date.now() - ta) / 1000;
const hostIdx = b.findIndex((r) => r.kind === 'host' && r.members > 0);
const host = b[hostIdx];
const clients = b.map((r, k) => ({ r, k })).filter(({ r }) => r.kind === 'client');
const perClient = clients.map(({ r, k }) => (r.seen - a[k].seen) / secs);
console.log(JSON.stringify({
  pilots: n,
  system,
  allInOneSystem: b.every((r) => r.system === b[0].system),
  phases: b.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {}),
  joinedWithin_s: joinedAt,
  hostMembers: host?.members,
  hostUpload_kBps: host ? Math.round((host.sent - a[hostIdx].sent) / secs / 1024) : null,
  hostWorlds_perSec: host ? +((host.worlds - a[hostIdx].worlds) / secs).toFixed(1) : null,
  clientWorlds_perSec_min: perClient.length ? +Math.min(...perClient).toFixed(1) : null,
  clientWorlds_perSec_avg: perClient.length ? +(perClient.reduce((x, y) => x + y, 0) / perClient.length).toFixed(1) : null,
}));
await browser.close();
