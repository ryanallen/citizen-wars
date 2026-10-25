import { App } from './app';
import { Clock } from './clock';
import { Presenter } from './present';
import { Online } from './online';
import { loadRelays } from './net/config';
import { loadCallsign, saveCallsign } from './callsign';
import { drawWorld } from './scene';
import { keysInput } from './sim/input';

// Offline: the DOS menu and game. Online (the default): a system with others.
const app = new App((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
const presenter = new Presenter(document.getElementById('screen') as HTMLCanvasElement);
const clock = new Clock();
let mode: 'online' | 'offline' = 'online';
let online: Online | null = null;
let soundOn = false;

const wanted = () => decodeURIComponent(location.hash.slice(1)) || null;

loadRelays().then((relays) => {
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
  if (e.code === 'Escape') {
    mode = mode === 'online' && online ? 'offline' : 'online';
    if (mode === 'offline') app.openMenu();
    e.preventDefault();
    return;
  }
  if (e.code === 'F8') { soundOn = !soundOn; app.game.soundOn = soundOn; e.preventDefault(); return; }
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
  if (app.keys.up(e.code)) e.preventDefault();
});
window.addEventListener('blur', () => app.keys.clear());
window.addEventListener('pointerdown', () => app.speaker.unlock());

function onlineFrame(o: Online, n: number) {
  for (let i = 0; i < n; i++) {
    const [l, r] = app.keys.masks();
    o.tick(keysInput(l | r));
  }
  const v = o.view();
  const names: Record<number, string> = {};
  for (const m of v.roster) names[m.side] = m.callsign;
  drawWorld(v.game, app.screen, names);
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
  if (mode === 'online' && online) {
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
