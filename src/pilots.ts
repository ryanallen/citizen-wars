// Test pilots (ticket, Phase 3): N robot pilots from one tab, each with its own
// key and its own WebRTC connections through the real relays, so a load or
// join test needs no extra browser windows.

import { Online } from './online';
import { loadRelays } from './net/config';
import { loadSystems } from './systems';
import { defensive, offensive } from './sim/robot';
import type { Game } from './sim/game';
import { NO_INPUT, type Input } from './sim/input';
import { Rng } from './sim/rng';
import { TICK_MS } from './clock';

const params = new URLSearchParams(location.search);
const count = Math.max(1, Math.min(64, Number(params.get('pilots') ?? 1)));
const system = params.get('system');
const stagger = Number(params.get('stagger') ?? 400);

/**
 * What this pilot's robot does, seen from its own side, with its own random
 * numbers so it never disturbs its copy of the world.
 */
const dice = new Rng((Date.now() >>> 0) ^ 0x9e3779b9);
function robot(g: Game, side: number): Input {
  if (side < 0 || side >= g.ships || !g.present[side]) return NO_INPUT;
  const view = g.robotView(side);
  return side % 2 === 0 ? defensive(view, dice) : offensive(view, dice);
}

const pilots: Online[] = [];
const rows = document.querySelector('#pilots tbody')!;

Promise.all([loadRelays(), loadSystems()]).then(async ([relays]) => {
  for (let n = 0; n < count; n++) {
    const p = new Online({ relays, callsign: `PILOT-${n + 1}`, wanted: system });
    pilots.push(p);
    p.start();
    rows.insertAdjacentHTML('beforeend', `<tr id="p${n}"><td>${n + 1}</td></tr>`);
    await new Promise((r) => setTimeout(r, stagger));
  }
});

// The pilots fly on the game's own clock; their robots read their own copy of the world.
let last = performance.now();
let carry = 0;
setInterval(() => {
  const now = performance.now();
  carry += now - last;
  last = now;
  let ticks = Math.floor(carry / TICK_MS);
  carry -= ticks * TICK_MS;
  ticks = Math.min(ticks, 18);
  for (let t = 0; t < ticks; t++) {
    for (const p of pilots) {
      const v = p.view();
      p.tick(robot(v.game, v.side));
    }
  }
}, 10);

setInterval(() => {
  pilots.forEach((p, n) => {
    const row = document.getElementById(`p${n}`);
    if (!row) return;
    const ph = p.phase;
    const v = p.view();
    const rtt = ph.kind === 'client' ? Math.round(ph.client.rttMs) : '';
    row.innerHTML = `<td>${n + 1}</td><td>${p.callsign}</td><td>${ph.kind}${ph.kind === 'connecting' ? ` ${ph.attempt}` : ''}</td>`
      + `<td>${p.system ?? ''}</td><td>${ph.kind === 'connecting' ? '' : v.side}</td><td>${v.roster.length}</td><td>${rtt}</td><td>${p.log.at(-1) ?? ''}</td>`;
  });
}, 500);

Object.assign(window as object, { pilots });
