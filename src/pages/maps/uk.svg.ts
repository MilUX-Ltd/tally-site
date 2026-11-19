// /maps/uk.svg, written at build: the UK outline the company pages draw their
// point on. Made from the committed cluster areas (ONS boundaries, Open
// Government Licence v3.0), which between them cover the UK, in the same
// projection as projectUk. One shared, cached file; each page adds only a dot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRoute } from 'astro';
import { projectUk, UK_MAP } from '../../lib/company-page';

type Ring = Array<[number, number]>;
interface Feature {
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

export const GET: APIRoute = () => {
  const regions = JSON.parse(readFileSync(join(process.cwd(), 'public', 'clusters', 'cluster-regions.geojson'), 'utf8')) as { features: Feature[] };
  const rings: Ring[] = [];
  for (const f of regions.features) {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) rings.push(...polygon);
  }
  const d = rings
    .map((ring) => {
      const points = ring.map(([lon, lat]) => projectUk(lon, lat)).map((p) => `${p.x} ${p.y}`);
      return `M${points.join('L')}Z`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${UK_MAP.width} ${UK_MAP.height}" width="${UK_MAP.width}" height="${UK_MAP.height}"><path d="${d}" fill="#d2c78d" stroke="#d2c78d" stroke-width="0.6" stroke-linejoin="round"/></svg>\n`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
