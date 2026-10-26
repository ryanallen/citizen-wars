import { describe, expect, test } from 'vitest';
import { Key, Game } from './sim/game';
import { Screen } from './screen';
import { ACTIONS, DEFAULT_BINDINGS, bind, unbind, keymap, keyName, keysPage, defaultControls, reserved, loadControls } from './controls';
import { KEYS_PAGE } from './design/pages';
import { KeyState } from './input';
import { Pointer } from './pointer';
import { ControlsScreen } from './controls-screen';

describe('bindings', () => {
  test('a key put on one action comes off the one that had it', () => {
    const b = bind(DEFAULT_BINDINGS, Key.Cloak, 1, 'KeyW');
    expect(b[Key.Cloak]).toEqual(['ShiftLeft', 'KeyW']);
    expect(b[Key.Impulse]).toEqual(['', '']);
    expect(keymap(b).KeyW).toEqual([0, Key.Cloak]);
  });

  test('keys saved before strafing: A and D come off the turns onto the strafes', () => {
    const old = structuredClone(DEFAULT_BINDINGS) as Record<number, [string, string]>;
    old[Key.CCW] = ['KeyA', '']; old[Key.CW] = ['KeyD', 'KeyX'];
    delete old[Key.StrafeLeft]; delete old[Key.StrafeRight];
    const store = { 'citizenwars.controls': JSON.stringify({ bindings: old, mouseAim: true }) } as Record<string, string>;
    globalThis.localStorage = { getItem: (k: string) => store[k] ?? null } as Storage;
    const b = loadControls().bindings;
    expect(b[Key.StrafeLeft]).toEqual(['KeyA', '']);
    expect(b[Key.StrafeRight]).toEqual(['KeyD', '']);
    expect(b[Key.CCW]).toEqual(['', '']);
    expect(b[Key.CW]).toEqual(['KeyX', '']);
  });

  test('clearing the first key moves the second up', () => {
    expect(unbind(DEFAULT_BINDINGS, Key.Photon, 0)[Key.Photon]).toEqual(['Space', '']);
  });

  test('the player\'s keys win over the second player\'s', () => {
    const b = bind(DEFAULT_BINDINGS, Key.Impulse, 1, 'ArrowUp');
    expect(keymap(b).ArrowUp).toEqual([0, Key.Impulse]);
    const k = new KeyState(keymap(b));
    k.down('ArrowUp');
    expect(k.masks()).toEqual([1 << Key.Impulse, 0]);
  });

  test('names, and the keys the game keeps', () => {
    expect(['KeyW', 'Mouse2', 'ShiftLeft', 'Numpad0', 'Digit3'].map(keyName)).toEqual(['W', 'RIGHT CLICK', 'L SHIFT', 'PAD 0', '3']);
    expect(['Escape', 'Tab', 'F10'].every(reserved)).toBe(true);
    expect(reserved('ControlLeft')).toBe(false);
  });

  test('the GAME KEYS page shows the keys as bound, each cell 7 wide', () => {
    const rows = keysPage(KEYS_PAGE, DEFAULT_BINDINGS).filter(([x, y]) => x === 50 && [64, 96, 128].includes(y));
    expect(rows[0][2]).toBe('\x15 RMB/E \x15   W   \x15LMB/SPC\x15    \x15  7//  \x15 8/UP  \x15 9/ENT \x15');
    for (const [, , t] of rows) expect(t.length).toBe(KEYS_PAGE.find(([x, y]) => x === 50 && y === 64)![2].length);
  });
});

describe('mouse aim', () => {
  const ship = (angle: number) => {
    const g = new Game(1, new Screen());
    g.startRound();
    g.angle[g.ship(0)] = angle;
    return g;
  };

  test('turns toward the pointer the short way, and holds within a step', () => {
    const p = new Pointer();
    const g = ship(0);
    const i = g.ship(0);
    // The pointer straight below the ship: angle 64, clockwise from 0.
    p.move(g.x(i) / g.w, Math.min(0.99, (g.y(i) + 40) / g.h));
    expect(p.keys(g, 0)).toBe(1 << Key.CW);
    g.angle[i] = 190;
    expect(p.keys(g, 0)).toBe(1 << Key.CCW);
    g.angle[i] = 64;
    expect(p.keys(g, 0)).toBe(0);
  });

  test('a turn key stops the steering until the mouse moves', () => {
    const p = new Pointer();
    const g = ship(0);
    p.move(0.99, 0.5);
    p.steering = false;
    expect(p.keys(g, 0)).toBe(0);
  });
});

describe('the controls screen', () => {
  test('Enter, then a key, puts it on the chosen action', () => {
    let saved = defaultControls();
    const c = new ControlsScreen(saved, (n) => { saved = n; });
    c.key('ArrowDown');
    c.key('ArrowRight');
    c.key('Enter');
    expect(c.listening).toBe(true);
    c.key('KeyJ');
    expect(saved.bindings[ACTIONS[1].key]).toEqual(['KeyA', 'KeyJ']);
  });

  test('a mouse button can be bound, Escape cancels, and Escape leaves', () => {
    let saved = defaultControls();
    const c = new ControlsScreen(saved, (n) => { saved = n; });
    c.key('Enter');
    c.click(2, 0, 0);
    expect(saved.bindings[Key.Impulse]).toEqual(['Mouse2', '']);
    expect(saved.bindings[Key.Phaser]).toEqual(['KeyE', '']);
    c.key('Enter');
    expect(c.key('Escape')).toBe(false);
    expect(c.key('Escape')).toBe(true);
  });

  test('draws without throwing', () => {
    const c = new ControlsScreen(defaultControls(), () => {});
    c.draw(new Screen());
  });
});
