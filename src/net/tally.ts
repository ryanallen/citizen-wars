// Kills, site-wide (ticket, Decisions: how are kills counted): every kill by a
// robot or a person in a game a person is in. The host writes one stored note
// per game, named by its system and the second it began, holding the game's
// kills so far, rewritten as they rise. A host taking over carries the kills
// and writes the same name, so each page takes the highest per name and sums
// them.
//
// Anyone may write such a note, so the count takes no more than a game could
// have made: a game begins no earlier than the site and no later than its
// note, and kills come no faster than every ship in it dying once per explosion.

import { Identity, Pool, type NostrEvent } from './nostr';
import { KIND_NOTE, CAP } from './config';

export const GAME_TAG = 'citizen-wars-game';
/** Notes asked for a page; relays cap a query at a few hundred, so the count reads back in pages. */
const PAGE = 500;
const PAGES = 40;
/** The first of the month the site went up; no game began before it. */
export const SITE_BORN = 1790812800;
/** Kills a second at most: every ship dying once per 6.1 s explosion (game.ts). */
const KILL_RATE = CAP / 6;
/** Seconds a note's clock may run ahead of the relay's. */
const SKEW = 300;

/** The most kills a game born then can have by the note's time. */
export const mostKills = (born: number, at: number): number =>
  born < SITE_BORN || born > at + SKEW ? 0 : CAP + Math.floor(Math.max(0, at - born) * KILL_RATE);

export function killsEvent(me: Identity, system: string, born: number, kills: number) {
  return me.sign({
    kind: KIND_NOTE,
    tags: [['d', `${GAME_TAG}/${system}/${born}`], ['t', GAME_TAG]],
    content: JSON.stringify({ system, born, kills, v: 1 }),
  });
}

const nameOf = (e: NostrEvent): string | null => e.tags.find((t) => t[0] === 'd' && t[1]?.startsWith(`${GAME_TAG}/`))?.[1] ?? null;

function killsOf(e: NostrEvent): number {
  try {
    const c = JSON.parse(e.content);
    const k = Number(c.kills);
    return Number.isFinite(k) && k > 0 ? Math.min(Math.floor(k), mostKills(Number(c.born), e.created_at)) : 0;
  } catch {
    return 0;
  }
}

function page(pool: Pool, until: number | undefined, waitMs: number): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const found: NostrEvent[] = [];
    let stop = () => {};
    const done = () => { clearTimeout(timer); stop(); resolve(found); };
    const timer = setTimeout(done, waitMs);
    stop = pool.subscribe([{ kinds: [KIND_NOTE], '#t': [GAME_TAG], limit: PAGE, ...(until ? { until } : {}) }], (e) => found.push(e), done);
  });
}

/** Every game note on the relays, newest page first: the sum of each game's highest kills; null with no relay. */
export async function countKills(pool: Pool, waitMs = 4000): Promise<number | null> {
  if (!(await pool.connect()).length) return null;
  const games = new Map<string, number>();
  const seen = new Set<string>();
  let until: number | undefined;
  for (let n = 0; n < PAGES; n++) {
    const events = await page(pool, until, waitMs);
    const before = seen.size;
    for (const e of events) {
      const d = nameOf(e);
      if (!d) continue;
      seen.add(e.id);
      games.set(d, Math.max(games.get(d) ?? 0, killsOf(e)));
    }
    if (!events.length || seen.size === before) break;
    until = Math.min(...events.map((e) => e.created_at));
  }
  return [...games.values()].reduce((t, k) => t + k, 0);
}
