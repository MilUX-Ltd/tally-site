// Post-deploy check: the deployed page returns 200, shows the Tally marker,
// and carries every security header exactly as public/_headers sets it.
// Usage: node scripts/check-deploy.mjs <deployed-url>
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
if (failures.length) {
  console.error(`Deploy check FAILED for ${url}\n\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Deploy check passed for ${url}`);
