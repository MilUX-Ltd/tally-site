// Re-checks the committed defence sites dataset against its sources. For each
// site it fetches the primary coordinates of the named Wikipedia article and
// reports any site whose committed point is more than 3 km from them, or whose
// article no longer has coordinates. Uses the network, so it is run by hand,
// not in CI. Nothing is written.
// Usage: node scripts/verify-sites.mjs
/* global URLSearchParams */
import { readFileSync } from 'node:fs';

const LIMIT_KM = 3;
const data = JSON.parse(readFileSync(new URL('../public/sites/defence-sites.json', import.meta.url), 'utf8'));
const rad = (d) => (d * Math.PI) / 180;
const km = (a, b, c, d) => {
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
};

async function coordinates(title) {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', titles: title, redirects: '1', prop: 'coordinates', coprimary: 'primary', format: 'json', formatversion: '2' })}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'tally-site-verify/1.0 (https://github.com/MilUX-Ltd/tally-site)' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const page = (await response.json()).query?.pages?.[0];
  return page?.coordinates?.[0] ?? null;
}

let problems = 0;
for (const site of data.sites) {
  if (site.source?.name !== 'Wikipedia') {
    console.log(`  skip  ${site.name}: source is ${site.source?.name}`);
    continue;
  }
  const c = await coordinates(site.source.title);
  if (!c) {
    problems++;
    console.log(`  FAIL  ${site.name}: ${site.source.title} has no primary coordinates`);
    continue;
  }
  const d = km(site.lat, site.lon, c.lat, c.lon);
  if (d > LIMIT_KM) problems++;
  console.log(`  ${d > LIMIT_KM ? 'FAIL' : 'ok  '}  ${site.name}: ${d.toFixed(2)} km from ${site.source.title}`);
}
console.log(`${data.sites.length} sites checked, ${problems} problem(s).`);
process.exit(problems ? 1 : 0);
