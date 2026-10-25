// Call signs (ticket, How it is built: Names): RED-7 until the player changes
// it, kept in localStorage. No accounts.

const WORDS = ['RED', 'BLUE', 'GOLD', 'JADE', 'GREY', 'PINK', 'TEAL', 'RUST', 'MINT', 'PLUM', 'SAND', 'ONYX', 'LIME', 'ROSE', 'IRON', 'SNOW'];
const KEY = 'citizen-wars.callsign';

export function randomCallsign(rand = Math.random): string {
  return `${WORDS[Math.floor(rand() * WORDS.length)]}-${1 + Math.floor(rand() * 99)}`;
}

/**
 * Capitals, digits and a dash, at most 8 characters, as the game's font draws
 * them best. No person may start with BOT, which names the robots.
 */
export function cleanCallsign(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/^(BOT-*)+/, '').slice(0, 8);
}

function store(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function loadCallsign(): string {
  const saved = cleanCallsign(store()?.getItem(KEY) ?? '');
  if (saved) return saved;
  const made = randomCallsign();
  saveCallsign(made);
  return made;
}

export function saveCallsign(s: string): string {
  const c = cleanCallsign(s);
  if (c) try { store()?.setItem(KEY, c); } catch { /* private window */ }
  return c;
}
