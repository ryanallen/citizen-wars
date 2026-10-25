// The star systems, nearest Sol first (ticket, Lore). Phase 4 builds the full
// list from the HYG catalogue into public/systems.json; until then, the
// nearest eight with their real distances.

export interface StarSystem { id: string; name: string; ly: number }

export let SYSTEMS: StarSystem[] = [
  { id: 'sol', name: 'SOL', ly: 0 },
  { id: 'alpha-centauri', name: 'ALPHA CENTAURI', ly: 4.37 },
  { id: 'barnards-star', name: "BARNARD'S STAR", ly: 5.96 },
  { id: 'luhman-16', name: 'LUHMAN 16', ly: 6.5 },
  { id: 'wise-0855-0714', name: 'WISE 0855-0714', ly: 7.43 },
  { id: 'wolf-359', name: 'WOLF 359', ly: 7.86 },
  { id: 'lalande-21185', name: 'LALANDE 21185', ly: 8.31 },
  { id: 'sirius', name: 'SIRIUS', ly: 8.6 },
];

export function setSystems(list: StarSystem[]): void {
  SYSTEMS = list;
}

export const systemById = (id: string): StarSystem | undefined => SYSTEMS.find((s) => s.id === id);
export const rank = (id: string): number => {
  const n = SYSTEMS.findIndex((s) => s.id === id);
  return n < 0 ? Number.MAX_SAFE_INTEGER : n;
};
