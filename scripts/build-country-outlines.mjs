// Builds src/data/country-outlines.json: the outline of each country in
// Europe and North America that Tally may show, from Natural Earth's 1:50m
// admin 0 countries (public domain, naturalearthdata.com). Company pages in a
// live country other than the UK draw their locator on it (src/pages/maps/).
// The UK keeps its ONS outline (scripts/build-uk-regions.mjs).
//
// Run by hand when the outlines need refreshing; the output is committed and
// the site never fetches boundaries at run time:
//   node scripts/build-country-outlines.mjs
// Each country keeps its main landmass and the islands near it (a territory
// far away, such as Svalbard or Alaska, is left off), simplified once.
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson';
const OUT = new URL('../src/data/country-outlines.json', import.meta.url);

// Europe as decided (the EU, the EEA, the UK, Switzerland, the Western
// Balkans, Ukraine, Moldova and Türkiye) and North America. Belarus and
// Russia are never shown.
const EUROPE = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH AL BA ME MK RS XK UA MD TR'.split(' ');
const NORTH_AMERICA = ['US', 'CA', 'MX'];
const WANTED = new Set([...EUROPE, ...NORTH_AMERICA]);

const DP = 2;
const TOLERANCE = 0.03;
const MIN_ISLAND = 0.02;
/** Degrees beyond the main landmass's box within which islands are kept. */
const NEAR = 4;

const polygonsOf = (geometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2);
}

function box(ring) {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function perpendicular(p, a, b) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let max = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], points[0], points[points.length - 1]);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

const round = (n) => Number(n.toFixed(DP));

function outline(geometry) {
  const outers = polygonsOf(geometry).map((poly) => poly[0]);
  const main = outers.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  const [w, s, e, n] = box(main);
  const near = (ring) => {
    const [rw, rs, re, rn] = box(ring);
    const cx = (rw + re) / 2;
    const cy = (rs + rn) / 2;
    return cx >= w - NEAR && cx <= e + NEAR && cy >= s - NEAR && cy <= n + NEAR;
  };
  return outers
    .filter((ring) => ring === main || (ringArea(ring) >= MIN_ISLAND && near(ring)))
    .map((ring) => simplify(ring, TOLERANCE).map(([x, y]) => [round(x), round(y)]))
    .filter((ring) => ring.length >= 4);
}

const response = await fetch(SOURCE, { headers: { 'User-Agent': 'tally-site boundary build' }, signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`);
const source = await response.json();

const countries = {};
for (const feature of source.features) {
  const p = feature.properties;
  // ISO_A2 is -99 for a few countries (France, Norway); ISO_A2_EH holds their code.
  const code = [p.ISO_A2, p.ISO_A2_EH, p.WB_A2].find((c) => typeof c === 'string' && /^[A-Z]{2}$/.test(c));
  if (!code || !WANTED.has(code) || countries[code]) continue;
  countries[code] = outline(feature.geometry);
}
const missing = [...WANTED].filter((c) => !countries[c]);
if (missing.length) throw new Error(`no outline for ${missing.join(', ')}`);

const sorted = Object.fromEntries(Object.entries(countries).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, `${JSON.stringify({ attribution: 'Made with Natural Earth. Free vector and raster map data at naturalearthdata.com (public domain).', source: SOURCE, countries: sorted })}\n`);
console.log(`Wrote ${Object.keys(sorted).length} country outlines to src/data/country-outlines.json`);
