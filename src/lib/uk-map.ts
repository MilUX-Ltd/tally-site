// Build-time only: the UK outline and region shapes the company pages draw
// their locator on, as SVG, in the projection of projectUk. Made from
// src/data/uk-regions.json (ONS boundaries, Open Government Licence v3.0;
// built by hand with scripts/build-uk-regions.mjs). Never imported by browser
// code: pages reference the files this writes (/maps/uk.svg and
// /maps/region/<slug>.svg), so each page adds only a dot or one image.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectUk, UK_MAP } from './company-page';
import { UK_BOUNDS } from './map-config';

type Ring = Array<[number, number]>;
interface Regions {
  regions: Array<{ code: string; name: string; rings: Ring[] }>;
  outline: Ring[];
  attribution: string;
}

let regions: Regions | null = null;
function ukRegions(): Regions {
  regions ??= JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'uk-regions.json'), 'utf8')) as Regions;
  return regions;
}

/** A point in map units, on a grid of `grid` units (0.1 at the finest). */
const at = ([lon, lat]: [number, number], grid = 0.1) => {
  const p = projectUk(lon, lat);
  const snap = (n: number) => Math.round((Math.round(n / grid) * grid) * 10) / 10;
  return `${snap(p.x)} ${snap(p.y)}`;
};

/** A closed ring as path data; points that fall on the same grid point are written once. */
function ringPath(ring: Ring, grid = 0.1): string {
  const points: string[] = [];
  for (const point of ring.slice(0, -1)) {
    const p = at(point, grid);
    if (points[points.length - 1] !== p) points.push(p);
  }
  while (points.length > 1 && points[points.length - 1] === points[0]) points.pop();
  return points.length >= 3 ? `M${points.join('L')}Z` : '';
}

/** Borders two regions share, each drawn once, as open lines. */
function sharedBorders(grid = 0.1): string {
  const key = (p: [number, number]) => `${p[0]},${p[1]}`;
  const seen = new Set<string>();
  for (const region of ukRegions().regions) for (const ring of region.rings) for (let i = 0; i < ring.length - 1; i++) seen.add(`${key(ring[i])}>${key(ring[i + 1])}`);
  let d = '';
  const done = new Set<string>();
  for (const region of ukRegions().regions) {
    for (const ring of region.rings) {
      let open = false;
      for (let i = 0; i < ring.length - 1; i++) {
        const forward = `${key(ring[i])}>${key(ring[i + 1])}`;
        const back = `${key(ring[i + 1])}>${key(ring[i])}`;
        if (seen.has(back) && !done.has(back)) {
          done.add(forward);
          d += open ? `L${at(ring[i + 1], grid)}` : `M${at(ring[i], grid)}L${at(ring[i + 1], grid)}`;
          open = true;
        } else {
          open = false;
        }
      }
    }
  }
  return d;
}

/** Lines of latitude and longitude every two degrees. */
export function graticule(): { lats: Array<{ label: string; y: number }>; lons: Array<{ label: string; x: number }> } {
  const [w, s, e, n] = UK_BOUNDS;
  const lats = [];
  for (let lat = Math.ceil(s / 2) * 2; lat < n; lat += 2) lats.push({ label: `${lat}°N`, y: projectUk(0, lat).y });
  const lons = [];
  for (let lon = Math.ceil(w / 2) * 2; lon < e; lon += 2) lons.push({ label: lon === 0 ? '0°' : `${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`, x: projectUk(lon, 0).x });
  return { lats, lons };
}

const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${UK_MAP.width} ${UK_MAP.height}" width="${UK_MAP.width}" height="${UK_MAP.height}">`;

/**
 * The UK as an SVG: the graticule, the land in white with an ink coast, and
 * region borders as hairlines. An image scales its lines with it, so there
 * are two drawings: /maps/uk.svg for the whole UK, and /maps/uk-local.svg,
 * finer and with thinner lines, for the local area a page magnifies.
 */
export function ukSvg(detail: 'whole' | 'local' = 'whole'): string {
  const local = detail === 'local';
  const grid = local ? 0.1 : 0.5;
  const k = local ? 0.3 : 1;
  const { lats, lons } = graticule();
  const lines = [...lats.map((l) => `M0 ${l.y}H${UK_MAP.width}`), ...lons.map((l) => `M${l.x} 0V${UK_MAP.height}`)].join('');
  const land = ukRegions()
    .outline.map((ring) => ringPath(ring, grid))
    .join('');
  const w = (n: number) => Math.round(n * k * 100) / 100;
  return (
    `${open}<path d="${lines}" fill="none" stroke="#d9d8ce" stroke-width="${w(0.35)}"/>` +
    `<path d="${land}" fill="#fff" stroke="#0c1510" stroke-width="${w(0.5)}" stroke-linejoin="round"/>` +
    `<path d="${sharedBorders(grid)}" fill="none" stroke="#c9c8bc" stroke-width="${w(0.3)}" stroke-linejoin="round"/></svg>\n`
  );
}

/** /maps/region/<slug>.svg: one region, hatched in the signal colour, to lay over /maps/uk.svg. */
export function regionSvg(name: string): string | null {
  const region = ukRegions().regions.find((r) => r.name === name);
  if (!region) return null;
  const d = region.rings.map((ring) => ringPath(ring)).join('');
  return (
    `${open}<defs><pattern id="h" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#f2d9a6"/><rect width="1.1" height="3" fill="#e2611c"/></pattern></defs>` +
    `<path d="${d}" fill="url(#h)" stroke="#0c1510" stroke-width="0.9" stroke-linejoin="round"/></svg>\n`
  );
}

/** /maps/uk-regions.json: the 12 region shapes as GeoJSON, for the Money view's shading (fetched only when it opens). */
export function ukRegionsGeoJSON(): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    attribution: ukRegions().attribution,
    features: ukRegions().regions.map((r) => ({
      type: 'Feature',
      properties: { name: r.name },
      geometry: { type: 'MultiPolygon', coordinates: r.rings.map((ring) => [ring]) },
    })),
  });
}
