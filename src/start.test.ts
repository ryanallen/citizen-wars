import { expect, test } from 'vitest';
import { StartScreen, CYCLE_TICKS, MORE } from './start';
import { defaultControls, unbind } from './controls';
import { Key } from './sim/game';
import { HOLD_TICKS, FLY_STEPS, TICKS_PER_STEP } from './menu';
import { Screen } from './screen';
import { font } from './design/bitmaps';

test('the title flies apart and comes back together each round', () => {
  const s = new StartScreen();
  const home = s.blocks.map((b) => [b.x, b.y]);
  expect(s.positions()).toEqual(home);
  s.step(HOLD_TICKS + FLY_STEPS * TICKS_PER_STEP);
  const out = s.positions();
  expect(out.filter(([x, y], n) => x !== home[n][0] || y !== home[n][1]).length).toBeGreaterThan(home.length / 2);
  s.step(FLY_STEPS * TICKS_PER_STEP);
  expect(s.positions()).toEqual(home);
  expect(CYCLE_TICKS).toBe(HOLD_TICKS + 2 * FLY_STEPS * TICKS_PER_STEP);
});

test('no star shows through a letter', () => {
  const st = new StartScreen();
  const screen = new Screen();
  // A star on every pixel of the title's area; blocks sit at x-4, y-4 as the original places them.
  const stars: [number, number][] = [];
  for (let y = 8; y < 100; y++) for (let x = 8; x < 632; x++) stars.push([x, y]);
  st.draw(screen, stars, defaultControls());
  for (const b of st.blocks) {
    const rows = font.frames[b.code];
    rows.forEach((bits, r) => {
      for (let c = 0; c < 16; c++) if (bits & (1 << (15 - c))) expect(screen.px[(b.y - 4 + r) * 640 + b.x - 4 + c]).toBe(1);
    });
  }
});

test("the start screen draws the player's own keys on a keyboard and mouse", () => {
  const read = (c: ReturnType<typeof defaultControls>) => { const sc = new Screen(); new StartScreen().draw(sc, [], c); return sc.px; };
  const d = defaultControls();
  const plain = read(d);
  // The picture is drawn between the title and the prompt.
  let lit = 0;
  for (let y = 98; y < 160; y++) for (let x = 0; x < 640; x++) lit += plain[y * 640 + x];
  expect(lit).toBeGreaterThan(2000);
  // A key taken off the picture changes it.
  expect(read({ ...d, bindings: unbind(d.bindings, Key.Cloak, 0) })).not.toEqual(plain);
  expect(MORE).toContain('F10 CONTROLS');
});
