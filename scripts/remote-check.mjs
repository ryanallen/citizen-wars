// Two real networks: this computer hosts a system on the live site, and a test
// pilot in a GitHub Actions runner joins it by name (.github/workflows/pilot.yml).
// Usage: node scripts/remote-check.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const url = 'https://ryanallen.github.io/spacewar-live/';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await (await browser.newContext()).newPage();
await page.goto(url);
const state = () => page.evaluate(() => {
  const o = window.citizenWarsOnline?.();
  if (!o) return null;
  return { phase: o.phase.kind, system: o.system, members: o.phase.kind === 'host' ? o.phase.host.members.size : 0, roster: o.view().roster.map((m) => m.callsign) };
});
let s = null;
for (let n = 0; n < 60 && s?.phase !== 'host'; n++) { await new Promise((r) => setTimeout(r, 1000)); s = await state(); }
log('hosting on the live site:', JSON.stringify(s));
execSync(`gh workflow run pilot.yml -R ryanallen/spacewar-live -f system=${s.system} -f seconds=150`, { stdio: 'inherit' });
log('runner started');
let ok = false;
for (let n = 0; n < 420; n++) {
  await new Promise((r) => setTimeout(r, 1000));
  s = await state();
  if (s?.members > 0) { ok = true; break; }
}
log(ok ? 'PASS' : 'FAIL', 'a player from the runner joined:', JSON.stringify(s));
await browser.close();
process.exit(ok ? 0 : 1);
