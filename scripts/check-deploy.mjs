// Post-deploy check: the deployed page returns 200, shows the Tally marker,
// and carries every security header exactly as public/_headers sets it; the
// search route runs and refuses an over-long request without calling the
// model. With --expect-search-fallback (previews, which never hold the key),
// a normal search must answer {"fallback": true}.
// Usage: node scripts/check-deploy.mjs <deployed-url> [--expect-search-fallback]
/* global setTimeout */
import { readFileSync } from 'node:fs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/check-deploy.mjs <deployed-url>');
  process.exit(2);
}

const expected = Object.fromEntries(
  readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^\s+[A-Za-z-]+:/.test(l))
    .map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

// A fresh deploy can take a few seconds to reach every Cloudflare location,
// so retry a 404 for up to a minute before judging the page.
let response = await fetch(url, { redirect: 'follow' });
for (let attempt = 1; attempt <= 12 && response.status === 404; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  response = await fetch(url, { redirect: 'follow' });
}

const failures = [];
if (response.status !== 200) failures.push(`expected status 200, got ${response.status}`);
const body = await response.text();
if (!body.includes('Tally')) failures.push('page body is missing the marker "Tally"');
for (const [name, value] of Object.entries(expected)) {
  const actual = response.headers.get(name);
  if (actual !== value) failures.push(`header ${name}:\n  expected: ${value}\n  actual:   ${actual}`);
}
const searchUrl = new URL('/api/search', url).toString();
const post = (q) =>
  fetch(searchUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q }) });
const tooLong = await post('x'.repeat(301));
if (tooLong.status !== 413) failures.push(`search: an over-long request should get 413, got ${tooLong.status}`);
if (process.argv.includes('--expect-search-fallback')) {
  const answer = await post('cyber companies');
  const text = await answer.text();
  if (answer.status !== 200 || text !== '{"fallback":true}') failures.push(`search: expected 200 {"fallback":true}, got ${answer.status} ${text.slice(0, 200)}`);
}

if (failures.length) {
  console.error(`Deploy check FAILED for ${url}\n\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Deploy check passed for ${url}`);
