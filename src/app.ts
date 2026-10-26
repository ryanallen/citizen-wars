// The offline game: the menu and its F-keys, play, and the round going back
// to the menu (original.md, Keys and Ship death; design-system.md, Menu).

import { Game } from './sim/game';
import { keysInput, type Input } from './sim/input';
import { Menu } from './menu';
import { KeyState } from './input';
import { Pointer } from './pointer';
import { keymap, keysPage, loadControls, saveControls, type Controls } from './controls';
import { KEYS_PAGE } from './design/pages';
import { Speaker } from './sound';
import { Screen } from './screen';

export class App {
  readonly screen = new Screen();
  readonly game: Game;
  readonly menu: Menu;
  readonly keys = new KeyState();
  readonly pointer = new Pointer();
  controls: Controls = loadControls();
  readonly speaker = new Speaker();
  mode: 'menu' | 'play' = 'menu';

  constructor(seed: number) {
    this.game = new Game(seed, this.screen);
    this.menu = new Menu(this.screen, this.game.rng, () => [this.game.wins[0], this.game.wins[1]]);
    this.setControls(this.controls, false);
    this.openMenu();
  }

  private toggles() {
    const o = this.game.options;
    return { robotLeft: o.robot[0], robotRight: o.robot[1], planet: o.planet, gravity: o.gravity, pause: this.game.paused };
  }

  openMenu(): void {
    this.mode = 'menu';
    this.game.speaker = { on: false, divisor: 0 };
    this.keys.clear();
    this.menu.open(this.toggles());
  }

  play(): void {
    this.mode = 'play';
    this.game.paused = false;
    this.keys.clear();
    this.game.startRound();
  }

  /** The player's own keys and mouse aim, kept in the browser when `save`. */
  setControls(c: Controls, save = true): void {
    this.controls = c;
    this.keys.map = keymap(c.bindings);
    this.keys.clear();
    this.menu.keysPage = keysPage(KEYS_PAGE, c.bindings);
    if (save) saveControls(c);
  }

  /** The player's own keys this tick with the mouse aim on side `side`'s ship; and the second player's. */
  inputs(g: Game, side: number): [Input, Input] {
    const [l, r] = this.keys.masks();
    return [{ keys: l, aim: this.controls.mouseAim ? this.pointer.aim(g, side) : -1 }, keysInput(r)];
  }

  /** A function key; returns true when it was one of the game's. */
  functionKey(code: string): boolean {
    const g = this.game;
    if (code === 'F8') { g.soundOn = !g.soundOn; return true; }
    if (this.mode === 'play') {
      if (code === 'F1') { this.openMenu(); return true; }
      if (code === 'F7') { g.paused = !g.paused; return true; }
      return /^F[2-6]$/.test(code);
    }
    switch (code) {
      case 'F1': this.menu.next(); return true;
      case 'F2': this.play(); return true;
      case 'F3': g.options.robot[0] = !g.options.robot[0]; this.menu.mark('robotLeft'); return true;
      case 'F4': g.options.robot[1] = !g.options.robot[1]; this.menu.mark('robotRight'); return true;
      case 'F5': g.options.planet = !g.options.planet; this.menu.mark('planet'); return true;
      case 'F6': g.options.gravity = !g.options.gravity; this.menu.mark('gravity'); return true;
      case 'F7': g.paused = !g.paused; this.menu.mark('pause'); return true;
    }
    return false;
  }

  tick(): void {
    if (this.mode === 'menu') {
      this.menu.step();
      return;
    }
    this.game.inputs = this.inputs(this.game, 0);
    if (this.game.step() === 'round-over') this.openMenu();
  }

  sound(): void {
    const g = this.game;
    const clicks = g.soundOn ? g.explosionClickRate() : 0;
    this.speaker.set(this.mode === 'play' && g.audible.on, g.speaker.divisor, clicks);
  }
}
