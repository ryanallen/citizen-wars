// The starfield is the real sky (ticket, Lore): the 512 brightest catalogue
// stars as seen from a system's own position, laid flat on the screen
// (design-system.md, Sky). public/sky.bin is x, y, z (parsecs) and absolute
// magnitude for each star, as four float32s.

export type Sky = Float32Array;

export async function loadSky(base = import.meta.env?.BASE_URL ?? '/'): Promise<Sky> {
  const r = await fetch(`${base}sky.bin`);
  return new Float32Array(await r.arrayBuffer());
}

/** The brightest stars seen from (x, y, z), as screen pixels in [8, 632) x [8, 192). */
export function skyFrom(sky: Sky, [x0, y0, z0]: number[], count = 512): [number, number][] {
  const stars: { m: number; lon: number; lat: number }[] = [];
  for (let n = 0; n < sky.length; n += 4) {
    const dx = sky[n] - x0;
    const dy = sky[n + 1] - y0;
    const dz = sky[n + 2] - z0;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.05) continue; // the system's own stars
    const m = sky[n + 3] + 5 * Math.log10(d / 10);
    stars.push({ m, lon: Math.atan2(dy, dx), lat: Math.asin(dz / d) });
  }
  stars.sort((a, b) => a.m - b.m);
  return stars.slice(0, count).map((s) => [
    8 + Math.min(623, Math.floor(((s.lon + Math.PI) / (2 * Math.PI)) * 624)),
    8 + Math.min(183, Math.floor(((Math.PI / 2 - s.lat) / Math.PI) * 184)),
  ]);
}
