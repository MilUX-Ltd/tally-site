// Build check: main-thread JavaScript the home page loads before map tiles
// must be no more than 300 KB compressed (Brotli, as served). Every chunk in
// dist/_astro is counted, which over-counts rather than under, except two that
// are reported separately: the hexagon library, which loads after the map has
// started, and the map's web worker, which runs off the main thread (it is
// needed before tiles are drawn, so its size is printed beside the total).
// Usage: node scripts/check-bundle-size.mjs (after astro build)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';

const BUDGET = 300 * 1000;
const dist = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', dist), 'utf8');

const size = (file) => brotliCompressSync(readFileSync(new URL(file, dist))).length;

// Reported separately: the hexagon library chunk and the map worker.
const SEPARATE = [/^binning\.[\w-]+\.js$/, /^maplibre-gl-worker\.[\w-]+\.m?js$/];

const assets = readdirSync(new URL('_astro/', dist)).filter((f) => /\.m?js$/.test(f));
const counted = new Set(assets.filter((f) => !SEPARATE.some((re) => re.test(f))).map((f) => `_astro/${f}`));
// Any script the page references from outside _astro counts too.
for (const m of html.matchAll(/(?:src|component-url|renderer-url)="\/?([^"]+\.js)"/g)) if (existsSync(new URL(m[1], dist))) counted.add(m[1]);
if (![...counted].some((f) => /maplibre-gl\.[\w-]+\.js$/.test(f))) {
  console.error('Bundle-size check could not find the map library chunk; failing rather than passing blind.');
  process.exit(1);
}

const total = [...counted].reduce((n, f) => n + size(f), 0);
const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
for (const f of [...counted].sort()) console.log(`  ${kb(size(f)).padStart(9)}  ${f}`);
const later = assets.filter((f) => !counted.has(`_astro/${f}`));
for (const f of later) console.log(`  ${kb(size(`_astro/${f}`)).padStart(9)}  _astro/${f} (reported, not counted)`);
console.log(`Main-thread JavaScript before map tiles: ${kb(total)} Brotli (budget ${kb(BUDGET)}).`);
if (total > BUDGET) {
  console.error('Bundle-size check FAILED: the page loads too much JavaScript before map tiles.');
  process.exit(1);
}
