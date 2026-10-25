import { describe, expect, test } from 'vitest';
import { Clock, TICK_HZ, MAX_CATCH_UP } from './clock';
import { wholeScale } from './present';
import { KeyState } from './input';
import { Key } from './sim/game';
import { App } from './app';
import { shipLeft, shipRight, torpedoLeft, planet, font } from './design/bitmaps';
import { Menu, FLY_STEPS, TICKS_PER_STEP, HOLD_TICKS, PAGE_TICKS } from './menu';
import { Screen } from './screen';
import { Rng } from './sim/rng';

describe('the loop', () => {
  test('72.80 ticks a second, whatever the frame rate', () => {
    expect(TICK_HZ).toBeCloseTo(72.8, 1);
    const c = new Clock();
    let n = c.ticks(0);
    for (let t = 1; t <= 600; t++) n += c.ticks((t * 1000) / 60);
    expect(n).toBeGreaterThanOrEqual(727);
    expect(n).toBeLessThanOrEqual(729);
  });

  test('a stall catches up at most a little', () => {
    const c = new Clock();
    c.ticks(0);
    expect(c.ticks(5000)).toBe(MAX_CATCH_UP);
  });
});

describe('the canvas', () => {
  test('640x400 scaled in whole steps', () => {
    expect(wholeScale(1280, 800)).toBe(2);
    expect(wholeScale(1919, 1079)).toBe(2);
    expect(wholeScale(1920, 1200)).toBe(3);
    expect(wholeScale(300, 200)).toBe(1);
  });
});

describe('the design system in code', () => {
  test('sprites and font as read', () => {
    expect(shipLeft.frames.length).toBe(16);
    expect(shipRight.frames.length).toBe(16);
    expect(torpedoLeft.frames.length).toBe(8);
    expect(planet.frames.length).toBe(16);
    expect(planet.width).toBe(32);
    expect(font.frames.length).toBe(128);
  });
});

describe('input', () => {
  test('left Q W E / A S D / Z X C', () => {
    const k = new KeyState();
    for (const c of ['KeyQ', 'KeyD', 'KeyX']) k.down(c);
    expect(k.masks()).toEqual([(1 << Key.Phaser) | (1 << Key.CW) | (1 << Key.Hyper), 0]);
  });

  test('right keypad and its stand-ins I O P / K L ; / , . /', () => {
    const k = new KeyState();
    k.down('Numpad9');
    k.down('KeyK');
    k.down('Slash');
    expect(k.masks()).toEqual([0, (1 << Key.Photon) | (1 << Key.CCW) | (1 << Key.Shield)]);
    k.up('Numpad9');
    expect(k.masks()[1] & (1 << Key.Photon)).toBe(0);
  });

  test('a tap between two ticks counts for one tick', () => {
    const k = new KeyState();
    k.down('KeyE');
    k.up('KeyE');
    expect(k.masks()).toEqual([1 << Key.Photon, 0]);
    expect(k.masks()).toEqual([0, 0]);
  });

  test('other keys are not the game\'s', () => {
    expect(new KeyState().down('KeyG')).toBe(false);
  });
});

describe('the menu', () => {
  test('F3-F7 toggle robots, planet, gravity and pause; F2 plays; F1 in play goes back', () => {
    const app = new App(5);
    expect(app.mode).toBe('menu');
    for (const f of ['F3', 'F4', 'F5', 'F6']) app.functionKey(f);
    expect(app.game.options).toEqual({ planet: true, gravity: true, robot: [true, true] });
    app.functionKey('F2');
    expect(app.mode).toBe('play');
    app.functionKey('F7');
    expect(app.game.paused).toBe(true);
    app.functionKey('F7');
    app.functionKey('F1');
    expect(app.mode).toBe('menu');
  });

  test('F8 toggles sound, which starts off', () => {
    const app = new App(5);
    expect(app.game.soundOn).toBe(false);
    app.functionKey('F8');
    expect(app.game.soundOn).toBe(true);
  });

  test('a round ending goes back to the menu', () => {
    const app = new App(5);
    app.functionKey('F2');
    app.game.shield[0] = -1;
    for (let n = 0; n < 1000 && app.mode === 'play'; n++) app.tick();
    expect(app.mode).toBe('menu');
    expect(app.game.wins).toEqual([0, 1]);
  });

  test('the title flies out and back to where it began', () => {
    const s = new Screen();
    const m = new Menu(s, new Rng(9), () => [0, 0]);
    m.open({ robotLeft: false, robotRight: false, planet: false, gravity: false, pause: false });
    const before = s.px.slice();
    const ticks = HOLD_TICKS + 2 * FLY_STEPS * TICKS_PER_STEP;
    for (let n = 0; n < ticks; n++) m.step();
    // Same picture, apart from the corner planet, which animates (rows 8-40, x >= 576).
    let diff = 0;
    for (let i = 0; i < s.px.length; i++) {
      const x = i % 640;
      const y = Math.floor(i / 640);
      if (y < 44 && x >= 568) continue;
      if (s.px[i] !== before[i]) diff++;
    }
    expect(diff).toBe(0);
    expect(PAGE_TICKS).toBe(582);
  });
});
