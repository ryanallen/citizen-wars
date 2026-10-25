import { App } from './app';
import { Clock } from './clock';
import { Presenter } from './present';
import { Online } from './online';
import { loadRelays } from './net/config';
import { loadCallsign, saveCallsign } from './callsign';
import { drawWorld } from './scene';
import { keysInput, NO_INPUT } from './sim/input';
import { drawStart } from './start';
import { loadSystems, systemById, systemLabel } from './systems';
import { loadSky, skyFrom, type Sky } from './sky';

// Offline: the DOS menu and game. Online (the default): a system with others.
const app = new App((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
const presenter = new Presenter(document.getElementById('screen') as HTMLCanvasElement);
const clock = new Clock();
// The site opens on the start screen; Enter goes into the system found behind it.
let mode: 'start' | 'online' | 'offline' = 'start';
let startTicks = 0;
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

window.addEventListener('keydown', (e) => {
  app.speaker.unlock();
  if (mode === 'start' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
    mode = online ? 'online' : 'offline';
    if (mode === 'offline') app.openMenu();
    app.keys.clear();
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
  if (app.keys.down(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') tab = false;
  if (app.keys.up(e.code)) e.preventDefault();
});
window.addEventListener('blur', () => { app.keys.clear(); tab = false; });
window.addEventListener('pointerdown', () => app.speaker.unlock());

function onlineFrame(o: Online, n: number) {
  for (let i = 0; i < n; i++) {
    const [l, r] = app.keys.masks();
    o.tick(keysInput(l | r));
  }
  const v = o.view();
  const names: Record<number, string> = {};
  for (const m of v.roster) names[m.side] = m.callsign;
  const inSystem = o.phase.kind !== 'connecting';
  const sys = o.system ? systemById(o.system) : undefined;
  drawWorld(v.game, app.screen, {
    callsigns: names,
    me: inSystem ? v.side : null,
    label: inSystem && sys ? systemLabel(sys) : undefined,
    sky: inSystem ? skyFor(o.system) : null,
    scoreboard: tab && inSystem,
  });
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
    startTicks += n;
    drawStart(app.screen, skyFor('sol') ?? app.game.starPoints(), startTicks);
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
