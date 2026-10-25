// Matches played, site-wide (ticket, Decisions: how are matches counted): the
// host of a match a person flew in (pressed a key, against a robot or another
// person) writes one stored note for it when it ends, named by its system and
// match number, and every page counts the different names. A host taking over
// writes the same name, so a match is counted once however many hosts it had.

import { Identity, Pool, type NostrEvent } from './nostr';
import { KIND_NOTE } from './config';

export const MATCH_TAG = 'citizen-wars-match';
/** Notes asked for a page; relays cap a query at a few hundred, so the count reads back in pages. */
const PAGE = 500;
const PAGES = 40;

export function matchEvent(me: Identity, system: string, match: number, players: number) {
  return me.sign({
    kind: KIND_NOTE,
    tags: [['d', `${MATCH_TAG}/${system}/${match}`], ['t', MATCH_TAG]],
    content: JSON.stringify({ system, match, players, v: 1 }),
  });
}

const nameOf = (e: NostrEvent): string | null => e.tags.find((t) => t[0] === 'd' && t[1]?.startsWith(`${MATCH_TAG}/`))?.[1] ?? null;

function page(pool: Pool, until: number | undefined, waitMs: number): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const found: NostrEvent[] = [];
    let stop = () => {};
    const done = () => { clearTimeout(timer); stop(); resolve(found); };
    const timer = setTimeout(done, waitMs);
    stop = pool.subscribe([{ kinds: [KIND_NOTE], '#t': [MATCH_TAG], limit: PAGE, ...(until ? { until } : {}) }], (e) => found.push(e), done);
  });
}

/** Every match note on the relays, newest page first, as the number of different matches; null with no relay. */
export async function countMatches(pool: Pool, waitMs = 4000): Promise<number | null> {
  if (!(await pool.connect()).length) return null;
  const names = new Set<string>();
  let until: number | undefined;
  for (let n = 0; n < PAGES; n++) {
    const events = await page(pool, until, waitMs);
    const before = names.size;
    for (const e of events) { const d = nameOf(e); if (d) names.add(d); }
    if (!events.length || names.size === before) break;
    until = Math.min(...events.map((e) => e.created_at));
  }
  return names.size;
}
