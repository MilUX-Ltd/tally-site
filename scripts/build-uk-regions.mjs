// Builds src/data/uk-regions.json: the nine English regions, Scotland, Wales
// and Northern Ireland, and the outline of the UK, from ONS Open Geography
// boundaries (December 2025, ultra generalised and clipped), Open Government
// Licence v3.0. Company pages draw their locator map from it at build time
// (src/pages/maps/).
//
// Run by hand when the boundaries change; the output is committed and the
// site never fetches boundaries at run time:
//   node scripts/build-uk-regions.mjs
// Each boundary is cut where its neighbour changes (coast, or the region on
// the other side) and each piece is simplified once, in one direction, so a
// border two regions share stays the same line in both. The outline is what
// is left when shared borders are removed.
import { writeFileSync } from 'node:fs';

const ONS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services';
const LAYERS = [
  ['Regions_December_2025_Boundaries_EN_BUC', 'RGN25CD', 'RGN25NM', null],
  ['Countries_December_2025_Boundaries_UK_BUC', 'CTRY25CD', 'CTRY25NM', ['Scotland', 'Wales', 'Northern Ireland']],
];
const OUT = new URL('../src/data/uk-regions.json', import.meta.url);

// Decimal places kept, simplification tolerance (degrees) and the smallest
// island kept (square degrees).
const DP = 3;
const TOLERANCE = 0.008;
const MIN_ISLAND = 0.004;

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'tally-site boundary build' }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const polygonsOf = (geometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

/** A ring on the grid, without repeated points; null when it collapses. */
function snap(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [Number(x.toFixed(DP)), Number(y.toFixed(DP))];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out.length >= 4 && Math.abs(ringArea(out)) > 0 ? out : null;
}

const key = (p) => `${p[0]},${p[1]}`;

/** Douglas-Peucker on an open line; the ends are kept. */
function simplifyLine(line) {
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = line[s];
    const [x2, y2] = line[e];
    const len = Math.hypot(x2 - x1, y2 - y1);
    let index = -1;
    let max = TOLERANCE;
    for (let i = s + 1; i < e; i++) {
      const d = len ? Math.abs((x2 - x1) * (y1 - line[i][1]) - (x1 - line[i][0]) * (y2 - y1)) / len : Math.hypot(line[i][0] - x1, line[i][1] - y1);
      if (d > max) [max, index] = [d, i];
    }
    if (index > 0) {
      keep[index] = 1;
      stack.push([s, index], [index, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Simplifies a piece in one fixed direction, so both regions on a shared border get the same line. */
function simplifyPiece(line) {
  const a = key(line[0]);
  const b = key(line[line.length - 1]);
  const forward = a < b || (a === b && key(line[1]) <= key(line[line.length - 2]));
  return forward ? simplifyLine(line) : simplifyLine([...line].reverse()).reverse();
}

/**
 * Simplifies every ring. owner maps a directed edge to the ring that has it;
 * an edge's neighbour is the ring holding its reverse, or none on the coast.
 */
function simplifyRings(rings) {
  const owner = new Map();
  rings.forEach((ring, r) => {
    for (let i = 0; i < ring.length - 1; i++) owner.set(`${key(ring[i])}>${key(ring[i + 1])}`, r);
  });
  return rings.map((ring) => {
    const n = ring.length - 1;
    const neighbour = (i) => owner.get(`${key(ring[(i + 1) % n])}>${key(ring[i % n])}`) ?? -1;
    // Start at a point where the neighbour changes, if there is one.
    let start = -1;
    for (let i = 0; i < n; i++) {
      if (neighbour(i) !== neighbour(i + n - 1)) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      // One neighbour all the way round (an island): split at the farthest point from the first.
      let far = 1;
      let best = -1;
      for (let i = 1; i < n; i++) {
        const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
        if (d > best) [best, far] = [d, i];
      }
      const out = [...simplifyLine(ring.slice(0, far + 1)), ...simplifyLine(ring.slice(far)).slice(1)];
      return out.length >= 4 ? out : null;
    }
    const out = [];
    let piece = [ring[start % n]];
    for (let step = 0; step < n; step++) {
      const i = start + step;
      piece.push(ring[(i + 1) % n]);
      if (step === n - 1 || neighbour(i + 1) !== neighbour(i)) {
        const line = simplifyPiece(piece);
        out.push(...(out.length ? line.slice(1) : line));
        piece = [ring[(i + 1) % n]];
      }
    }
    return out.length >= 4 ? out : null;
  });
}

/** Removes borders found in both directions and walks the rest into rings (as scripts/build-cluster-regions.mjs). */
function dissolve(rings) {
  const edges = new Map();
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = key(ring[i]);
      const b = key(ring[i + 1]);
      const reverse = `${b}>${a}`;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.set(`${a}>${b}`, [ring[i], ring[i + 1]]);
    }
  }
  const from = new Map();
  for (const [k, edge] of edges) {
    const a = k.split('>')[0];
    if (!from.has(a)) from.set(a, []);
    from.get(a).push(edge);
  }
  const out = [];
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
      if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) out.push(ring);
    }
  }
  return out;
}

async function main() {
  const regions = [];
  for (const [service, code, name, only] of LAYERS) {
    const url = `${ONS}/${service}/FeatureServer/0/query?where=1%3D1&outFields=${code},${name}&outSR=4326&f=geojson`;
    const geo = await getJson(url);
    for (const f of geo.features) {
      if (only && !only.includes(f.properties[name])) continue;
      const rings = polygonsOf(f.geometry)
        .filter((polygon) => Math.abs(ringArea(polygon[0])) >= MIN_ISLAND)
        .map((polygon) => snap(polygon[0]))
        .filter(Boolean);
      if (!rings.length) throw new Error(`${f.properties[name]}: empty outline`);
      regions.push({ code: f.properties[code], name: f.properties[name], rings });
    }
  }
  if (regions.length !== 12) throw new Error(`Expected 12 regions and countries, got ${regions.length}`);
  const simplified = simplifyRings(regions.flatMap((r) => r.rings));
  let at = 0;
  for (const r of regions) {
    r.rings = r.rings.map(() => simplified[at++]).filter(Boolean);
    if (!r.rings.length) throw new Error(`${r.name}: empty outline after simplifying`);
  }
  // Slivers where the two source layers disagree by a few metres are dropped.
  const outline = dissolve(regions.flatMap((r) => r.rings)).filter((ring) => Math.abs(ringArea(ring)) >= MIN_ISLAND);
  const out = {
    title: 'UK regions and countries, and the UK outline',
    source: 'Office for National Statistics, Open Geography Portal: Regions (December 2025) Boundaries EN BUC; Countries (December 2025) Boundaries UK BUC',
    source_url: 'https://geoportal.statistics.gov.uk/',
    licence: 'Open Government Licence v3.0',
    licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    attribution: 'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2025.',
    built: new Date().toISOString().slice(0, 10),
    regions,
    outline,
  };
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  const points = (rings) => rings.reduce((n, r) => n + r.length, 0);
  console.log(`Wrote ${OUT.pathname}: ${regions.length} regions (${points(regions.flatMap((r) => r.rings))} points), outline of ${outline.length} rings (${points(outline)} points).`);
  for (const r of regions) console.log(`  ${r.name}: ${r.rings.length} rings, ${points(r.rings)} points`);
}

await main();
