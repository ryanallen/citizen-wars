// A burst of test pilots at once (ticket, Phase 4): does every one land in a
// system, how long does it take, and do the systems fill nearest Sol first?
// Usage: node scripts/burst-check.mjs <N>
import { chromium } from 'playwright';

const n = Number(process.argv[2] ?? 16);
const url = process.env.URL ?? 'http://localhost:5199/citizen-wars/';
const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await (await browser.newContext()).newPage();
await page.goto(`${url}test.html?pilots=${n}&stagger=0`);
const t0 = Date.now();
let rows = [];
const landed = new Map();
while (Date.now() - t0 < 180000) {
  rows = await page.evaluate(() => window.pilots.map((p) => ({ kind: p.phase.kind, system: p.system })));
  rows.forEach((r, k) => { if (r.kind !== 'connecting' && !landed.has(k)) landed.set(k, (Date.now() - t0) / 1000); });
  if (rows.length === n && landed.size === n) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const bySystem = {};
for (const r of rows) bySystem[r.system] = (bySystem[r.system] ?? 0) + 1;
const times = [...landed.values()].sort((a, b) => a - b);
console.log(JSON.stringify({
  pilots: n,
  landed: landed.size,
  firstLanded_s: times[0],
  lastLanded_s: times.at(-1),
  medianLanded_s: times[Math.floor(times.length / 2)],
  bySystem,
}));
await browser.close();
