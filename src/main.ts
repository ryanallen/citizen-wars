import { App } from './app';
import { Clock } from './clock';
import { Presenter } from './present';

const app = new App((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
const presenter = new Presenter(document.getElementById('screen') as HTMLCanvasElement);
const clock = new Clock();

window.addEventListener('keydown', (e) => {
  app.speaker.unlock();
  if (/^F[1-8]$/.test(e.code)) {
    if (!e.repeat) app.functionKey(e.code);
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

function frame(now: number) {
  const n = clock.ticks(now);
  for (let i = 0; i < n; i++) app.tick();
  app.sound();
  presenter.draw(app.screen);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For tests driven from a browser: the app, to read its state.
(window as unknown as { citizenWars: App }).citizenWars = app;
