// Builds public/clusters/cluster-regions.geojson: one outline per cluster,
// in the cluster's colour, from ONS Open Geography boundaries (December 2025,
// ultra generalised and clipped), Open Government Licence v3.0.
//
// Run by hand when the clusters' areas change; the output is committed and
// the site never fetches boundaries at run time:
//   node scripts/build-cluster-regions.mjs [path or URL of clusters.json]
// The default is clusters.json in MilUX-Ltd/tally. Each cluster lists the
// ONS codes of the areas it covers (counties and unitary authorities, English
// regions or countries). The areas are merged into one outline per cluster by
// removing the borders they share, then simplified and rounded to keep the
// file small.
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = 'https://raw.githubusercontent.com/MilUX-Ltd/tally/main/clusters.json';
const ONS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services';
const LAYERS = [
  ['Counties_and_Unitary_Authorities_December_2025_Boundaries_UK_BUC', 'CTYUA25CD'],
  ['Regions_December_2025_Boundaries_EN_BUC', 'RGN25CD'],
  ['Countries_December_2025_Boundaries_UK_BUC', 'CTRY25CD'],
];
const OUT = new URL('../public/clusters/cluster-regions.geojson', import.meta.url);

// Simplification tolerance and smallest island kept, in degrees and square degrees.
const TOLERANCE = 0.012;
const MIN_ISLAND = 0.004;
const DP = 3;

async function getJson(url) {
  if (!/^https?:/.test(url)) return JSON.parse(readFileSync(url, 'utf8'));
  const response = await fetch(url, { headers: { 'User-Agent': 'tally-site boundary build' }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const polygonsOf = (geometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

/** Signed area of a ring (positive when anticlockwise), in square degrees. */
function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Merges polygons that share borders: edges found in both directions cancel; the rest are walked into rings. */
function dissolve(polygons) {
  const key = (p) => `${p[0]},${p[1]}`;
  const edges = new Map();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = key(ring[i]);
        const b = key(ring[i + 1]);
        if (a === b) continue;
        const reverse = `${b}>${a}`;
        if (edges.has(reverse)) edges.delete(reverse);
        else edges.set(`${a}>${b}`, [ring[i], ring[i + 1]]);
      }
    }
  }
  const from = new Map();
  for (const [k, edge] of edges) {
    const a = k.split('>')[0];
    if (!from.has(a)) from.set(a, []);
    from.get(a).push(edge);
  }
  const rings = [];
  for (const start of [...from.keys()]) {
    while (from.get(start)?.length) {
      const ring = [];
      let edge = from.get(start).pop();
      ring.push(edge[0]);
      for (let guard = 0; guard < 1e7; guard++) {
        ring.push(edge[1]);
        const next = from.get(key(edge[1]));
        if (!next?.length) break;
        edge = next.pop();
      }
      if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
    }
  }
  return rings;
}

/** Douglas-Peucker on a closed ring. */
function simplify(ring, tolerance) {
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  // Split a closed ring at its farthest point from the start so both halves simplify.
  let far = 1;
  let best = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > best) [best, far] = [d, i];
  }
  keep[far] = 1;
  const stack = [[0, far], [far, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = ring[s];
    const [x2, y2] = ring[e];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1e-12;
    let index = -1;
    let max = tolerance;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((x2 - x1) * (y1 - ring[i][1]) - (x1 - ring[i][0]) * (y2 - y1)) / len;
      if (d > max) [max, index] = [d, i];
    }
    if (index > 0) {
      keep[index] = 1;
      stack.push([s, index], [index, e]);
    }
  }
  const round = (n) => Number(n.toFixed(DP));
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    if (!keep[i]) continue;
    const p = [round(ring[i][0]), round(ring[i][1])];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out.length >= 4 ? out : null;
}

/** Outer rings with the holes they contain, simplified, small islands dropped. */
// The source winds outer rings one way (sign); the output follows GeoJSON
// (RFC 7946): outer rings anticlockwise, holes clockwise.
function shape(rings, sign) {
  const outers = [];
  const holes = [];
  for (const ring of rings) (Math.sign(ringArea(ring)) === sign ? outers : holes).push(ring);
  const wind = (ring, ccw) => ((ringArea(ring) > 0) === ccw ? ring : [...ring].reverse());
  const size = (r) => Math.abs(ringArea(r));
  const polygons = outers
    .filter((r) => size(r) >= MIN_ISLAND)
    .sort((a, b) => size(b) - size(a))
    .map((outer) => {
      const inner = holes.filter((h) => size(h) >= MIN_ISLAND && inside(h[0], outer));
      return [wind(outer, true), ...inner.map((h) => wind(h, false))].map((r) => simplify(r, TOLERANCE)).filter(Boolean);
    })
    .filter((p) => p.length && p[0]);
  return polygons;
}

/** Area-weighted centroid of the largest polygon's outer ring, for the event marker. */
function labelPoint(polygon) {
  const ring = polygon[0];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a += f;
    cx += (ring[i][0] + ring[i + 1][0]) * f;
    cy += (ring[i][1] + ring[i + 1][1]) * f;
  }
  let point = [cx / (3 * a), cy / (3 * a)];
  // A concave outline can put its centroid outside; fall back to a vertex-average inside point.
  if (!inside(point, ring)) point = ring[Math.floor(ring.length / 2)];
  return point.map((n) => Number(n.toFixed(DP)));
}

async function main() {
  const source = process.argv[2] ?? DATA;
  const { clusters } = await getJson(source);
  const areas = new Map();
  for (const [service, field] of LAYERS) {
    const url = `${ONS}/${service}/FeatureServer/0/query?where=1%3D1&outFields=${field}&outSR=4326&f=geojson`;
    const geo = await getJson(url);
    for (const f of geo.features) areas.set(f.properties[field], f.geometry);
  }
  const features = clusters.map((cluster) => {
    const polygons = cluster.regions.flatMap((r) => {
      const geometry = areas.get(r.code);
      if (!geometry) throw new Error(`${cluster.id}: no ONS boundary for ${r.code} (${r.name})`);
      return polygonsOf(geometry);
    });
    const sign = Math.sign(ringArea(polygons.reduce((a, b) => (Math.abs(ringArea(b[0])) > Math.abs(ringArea(a[0])) ? b : a))[0]));
    const parts = shape(dissolve(polygons), sign);
    if (!parts.length) throw new Error(`${cluster.id}: empty outline`);
    const [lon, lat] = labelPoint(parts[0]);
    return {
      type: 'Feature',
      properties: { id: cluster.id, name: cluster.name, colour: cluster.colour, lon, lat },
      geometry: parts.length === 1 ? { type: 'Polygon', coordinates: parts[0] } : { type: 'MultiPolygon', coordinates: parts },
    };
  });
  const out = {
    type: 'FeatureCollection',
    title: 'UK regional defence and security cluster areas',
    source:
      'Office for National Statistics, Open Geography Portal: Counties and Unitary Authorities, Regions and Countries (December 2025) Boundaries UK BUC, merged per cluster and simplified',
    source_url: 'https://geoportal.statistics.gov.uk/',
    licence: 'Open Government Licence v3.0',
    licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    attribution:
      'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2025.',
    built: new Date().toISOString().slice(0, 10),
    features,
  };
  const text = `${JSON.stringify(out)}\n`;
  writeFileSync(OUT, text);
  console.log(`Wrote public/clusters/cluster-regions.geojson: ${features.length} clusters, ${(text.length / 1000).toFixed(1)} KB.`);
}

main().catch((err) => {
  console.error(`build-cluster-regions failed: ${err.message}`);
  process.exit(1);
});
