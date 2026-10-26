// Drive the running game in Edge and save what it shows.
// Usage: node scripts/look.mjs <out folder> <steps...>
// Steps: "wait:<ms>", "tap:<code>", "down:<code>", "up:<code>", "shot:<name>", "eval:<js>".
// Shots are the 640x200 screen, one pixel per CGA pixel, as PNG.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [out, ...steps] = process.argv.slice(2);
const url = process.env.URL ?? 'http://localhost:5199/spacewar-live/';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.goto(url);
await page.waitForTimeout(300);

for (const step of steps) {
  const [verb, ...rest] = step.split(':');
  const arg = rest.join(':');
  if (verb === 'wait') await page.waitForTimeout(Number(arg));
  else if (verb === 'tap') await page.keyboard.press(arg);
  else if (verb === 'down') await page.keyboard.down(arg);
  else if (verb === 'up') await page.keyboard.up(arg);
  else if (verb === 'eval') console.log(JSON.stringify(await page.evaluate(arg)));
  else if (verb === 'shot') {
    const data = await page.evaluate(() => {
      const s = window.citizenWars.screen.px;
      const c = document.createElement('canvas');
      c.width = 640; c.height = 200;
      const x = c.getContext('2d');
      const img = x.createImageData(640, 200);
      for (let n = 0; n < s.length; n++) {
        const v = s[n] ? 255 : 0;
        img.data.set([v, v, v, 255], n * 4);
      }
      x.putImageData(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(path.join(out, `${arg}.png`), Buffer.from(data, 'base64'));
    await page.screenshot({ path: path.join(out, `${arg}-page.png`) });
  }
}
await browser.close();
