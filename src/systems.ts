// The star systems, nearest Sol first (ticket, Lore): public/systems.json,
// built from the HYG catalogue and Mamajek's table by tools/build_systems.py.
// Until it loads, the nearest few with their catalogue distances.

export interface Star { name: string; spect: string; mass: number; radius: number }
export interface StarSystem { id: string; name: string; ly: number; xyz?: number[]; stars?: Star[] }

export let SYSTEMS: StarSystem[] = [
  { id: 'sol', name: 'SOL', ly: 0, xyz: [0, 0, 0], stars: [{ name: 'SOL', spect: 'G2V', mass: 1, radius: 1 }] },
  { id: 'alpha-centauri', name: 'ALPHA CENTAURI', ly: 4.32 },
  { id: 'barnards-star', name: "BARNARD'S STAR", ly: 5.95 },
  { id: 'wolf-359', name: 'WOLF 359', ly: 7.8 },
];

export function setSystems(list: StarSystem[]): void {
  SYSTEMS = list;
}

export async function loadSystems(base = import.meta.env?.BASE_URL ?? '/'): Promise<StarSystem[]> {
  const r = await fetch(`${base}systems.json`);
  const j = await r.json();
  setSystems(j.systems);
  return SYSTEMS;
}

export const systemById = (id: string): StarSystem | undefined => SYSTEMS.find((s) => s.id === id);
export const rank = (id: string): number => {
  const n = SYSTEMS.findIndex((s) => s.id === id);
  return n < 0 ? Number.MAX_SAFE_INTEGER : n;
};

/** The system label (design-system.md, System label). */
export const systemLabel = (s: StarSystem): string => `${s.name}  ${s.ly.toFixed(2)} LY`;
