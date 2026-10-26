import { App } from './app';
import { Clock, TICK_HZ } from './clock';
import { Presenter } from './present';
import { Online } from './online';
import { loadRelays } from './net/config';
import { cleanCallsign, loadCallsign, saveCallsign } from './callsign';
import { drawWorld } from './scene';
import { NO_INPUT } from './sim/input';
import { StartScreen, killsWorldwide, gameClock } from './start';
import { loadSystems, systemById, systemLabel } from './systems';
import { loadSky, skyFrom, type Sky } from './sky';
import { ControlsScreen } from './controls-screen';
import { Key } from './sim/game';

// Offline: the DOS menu and game. Online (the default): a system with others.
const app = new App((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const presenter = new Presenter(canvas);
const clock = new Clock();
// The site opens on the start screen; Enter goes into the system found behind it.
type Mode = 'start' | 'online' | 'offline' | 'controls';
let mode: Mode = 'start';
// The controls screen, and the mode it goes back to.
let controls: ControlsScreen | null = null;
let back: Mode = 'start';
const start = new StartScreen();
let online: Online | null = null;
let soundOn = false;

const wanted = () => decodeURIComponent(location.hash.slice(1)) || null;

let sky: Sky | null = null;
let tab = false;
const skies = new Map<string, [number, number][]>();
function skyFor(system: string | null): [number, number][] | null {
  if (!sky || !system) return null;
  const s = systemById(system);
  if (!s?.xyz) return null;
  if (!skies.has(system)) skies.set(system, skyFrom(sky, s.xyz));
  return skies.get(system)!;
}

Promise.all([loadRelays(), loadSystems().catch(() => null), loadSky().then((s) => { sky = s; }).catch(() => null)]).then(([relays]) => {
  online = new Online({
    relays,
    callsign: loadCallsign(),
    wanted: wanted(),
    onSystem: (s) => history.replaceState(null, '', `#${s}`),
  });
  online.start();
}).catch(() => { mode = 'offline'; });

document.addEventListener('visibilitychange', () => online?.setHidden(document.visibilityState === 'hidden'));

function begin() {
  mode = online ? 'online' : 'offline';
  if (mode === 'offline') app.openMenu();
  app.keys.clear();
}

function openControls() {
  if (mode !== 'controls') back = mode;
  mode = 'controls';
  controls = new ControlsScreen(app.controls, (c) => app.setControls(c));
  app.keys.clear();
}

function closeControls() {
  mode = back;
  controls = null;
  app.keys.clear();
  if (mode === 'offline') app.openMenu();
}

window.addEventListener('keydown', (e) => {
  app.speaker.unlock();
  if (mode === 'controls' && controls) {
    if (!e.repeat && controls.key(e.code)) closeControls();
    e.preventDefault();
    return;
  }
  if (e.code === 'F10') {
    openControls();
    e.preventDefault();
    return;
  }
  if (mode === 'start' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
    begin();
    e.preventDefault();
    return;
  }
  if (e.code === 'Escape') {
    mode = mode !== 'offline' || !online ? 'offline' : 'online';
    if (mode === 'offline') app.openMenu();
    e.preventDefault();
    return;
  }
  if (e.code === 'F8') { soundOn = !soundOn; app.game.soundOn = soundOn; e.preventDefault(); return; }
  if (e.code === 'Tab') { tab = true; e.preventDefault(); return; }
  if (e.code === 'F9') {
    e.preventDefault();
    const c = saveCallsign(prompt('Your call sign', online?.callsign ?? '') ?? '');
    if (c && online) online.callsign = c;
    app.keys.clear();
    return;
  }
  if (/^F[1-8]$/.test(e.code)) {
    if (mode === 'offline' && !e.repeat) app.functionKey(e.code);
    e.preventDefault();
    return;
  }
  const k = app.keys.map[e.code];
  // A turn key takes the ship back from the mouse until the mouse moves again.
  if (k && (k[1] === Key.CW || k[1] === Key.CCW)) app.pointer.steering = false;
  if (app.keys.down(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') tab = false;
  if (app.keys.up(e.code)) e.preventDefault();
});
window.addEventListener('blur', () => { app.keys.clear(); tab = false; });

// The mouse: where it is over the screen, as fractions of it, and its buttons as keys.
function fraction(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}
window.addEventListener('pointermove', (e) => {
  const [fx, fy] = fraction(e);
  if (mode === 'controls') controls?.hover(fx, fy);
  else app.pointer.move(fx, fy);
});
window.addEventListener('pointerdown', (e) => {
  app.speaker.unlock();
  const [fx, fy] = fraction(e);
  if (mode === 'controls' && controls) {
    if (controls.click(e.button, fx, fy)) closeControls();
  } else if (mode === 'start') {
    if (e.button === 0) begin();
  } else if (mode === 'online' || (mode === 'offline' && app.mode === 'play')) {
    app.pointer.move(fx, fy);
    app.keys.down(`Mouse${e.button}`);
  }
  e.preventDefault();
});
window.addEventListener('pointerup', (e) => { app.keys.up(`Mouse${e.button}`); });
window.addEventListener('contextmenu', (e) => e.preventDefault());
// The middle button would start the browser's autoscroll.
window.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

function onlineFrame(o: Online, n: number) {
  for (let i = 0; i < n; i++) {
    const v = o.view();
    const [l, r] = app.inputs(v.game, v.side);
    o.tick({ keys: l.keys | r.keys, aim: l.aim });
  }
  const v = o.view();
  const names: Record<number, string> = {};
  for (const m of v.roster) names[m.side] = cleanCallsign(m.callsign);
  const inSystem = o.phase.kind !== 'connecting';
  const sys = o.system ? systemById(o.system) : undefined;
  drawWorld(v.game, app.screen, {
    callsigns: names,
    me: inSystem ? v.side : null,
    label: inSystem && sys ? systemLabel(sys) : undefined,
    sky: inSystem ? skyFor(o.system) : null,
    scoreboard: tab && inSystem,
  });
  if (inSystem && !tab) {
    // The game clock, top centre: how long this game has lasted.
    const t = gameClock(v.game.elapsed / TICK_HZ);
    app.screen.text(t, 320 - (t.length * 10) / 2 + 5, 8);
    if (o.kills !== null) {
      const k = killsWorldwide(o.kills);
      app.screen.text(k, 320 - (k.length * 10) / 2 + 5, 16);
    }
  }
  const p = o.phase;
  if (p.kind === 'connecting') {
    const t = `CONNECTING... ATTEMPT ${Math.max(1, p.attempt)}`;
    app.screen.text(t, 320 - (t.length * 10) / 2 + 5, 16);
  }
  const s = v.game.speaker;
  app.speaker.set(soundOn && s.on, s.divisor, soundOn ? v.game.explosionClickRate() : 0);
}

function frame(now: number) {
  const n = clock.ticks(now);
  if (mode === 'start') {
    // The system is found and kept behind the start screen.
    for (let i = 0; i < n; i++) online?.tick(NO_INPUT);
    start.step(n);
    start.draw(app.screen, skyFor('sol') ?? app.game.starPoints(), app.controls, online?.kills ?? null);
    app.speaker.set(false, 0, 0);
  } else if (mode === 'controls' && controls) {
    // A system in play keeps running, with the ship left alone.
    if (back !== 'offline') for (let i = 0; i < n; i++) online?.tick(NO_INPUT);
    controls.step(n);
    controls.draw(app.screen);
    app.speaker.set(false, 0, 0);
  } else if (mode === 'online' && online) {
    onlineFrame(online, n);
  } else {
    for (let i = 0; i < n; i++) app.tick();
    app.sound();
  }
  presenter.draw(app.screen);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For tests driven from a browser.
Object.assign(window as object, { citizenWars: app, citizenWarsOnline: () => online, citizenWarsMode: () => mode });
