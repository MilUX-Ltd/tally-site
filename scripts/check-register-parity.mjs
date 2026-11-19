// Fails if the register wording the site refuses (scripts/fetch-data.mjs,
// REGISTER_DENIED) differs from the data repo gate's list
// (.github/scripts/check.py, REGISTER_DENIED). Run in CI; reads the gate from
// the data repo's main branch.
// Usage: node scripts/check-register-parity.mjs
import { readFileSync } from 'node:fs';

const GATE = 'https://raw.githubusercontent.com/MilUX-Ltd/tally/main/.github/scripts/check.py';

/** The REGISTER_DENIED pattern in the site's fetch-data.mjs source, normalised. */
export function sitePattern(source) {
  const m = source.match(/const REGISTER_DENIED =\s*\/(.+)\/([a-z]*);/);
  if (!m) throw new Error('REGISTER_DENIED not found in fetch-data.mjs');
  return { pattern: normalise(m[1]), ignoreCase: m[2].includes('i') };
}

/** The REGISTER_DENIED pattern in the data repo's check.py source, normalised. */
export function gatePattern(source) {
  const m = source.match(/REGISTER_DENIED = re\.compile\(([\s\S]*?)\n\)/);
  if (!m) throw new Error('REGISTER_DENIED not found in check.py');
  const pieces = [...m[1].matchAll(/r"((?:[^"\\]|\\.)*)"/g)].map((p) => p[1]);
  if (!pieces.length) throw new Error('REGISTER_DENIED in check.py has no raw string pattern');
  return { pattern: normalise(pieces.join('')), ignoreCase: /re\.I\b|re\.IGNORECASE\b/.test(m[1]) };
}

const normalise = (p) => p.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

export function compare(site, gate) {
  const problems = [];
  if (site.pattern !== gate.pattern) problems.push(`patterns differ:\n  site: ${site.pattern}\n  gate: ${gate.pattern}`);
  if (site.ignoreCase !== gate.ignoreCase) problems.push('case sensitivity differs');
  return problems;
}

async function main() {
  const site = sitePattern(readFileSync(new URL('./fetch-data.mjs', import.meta.url), 'utf8'));
  const response = await fetch(GATE, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${GATE}: HTTP ${response.status}`);
  const problems = compare(site, gatePattern(await response.text()));
  if (problems.length) {
    console.error(`The refused register wording differs between the site and the data repo gate; keep them alike.\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('Refused register wording matches the data repo gate.');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  main().catch((err) => {
    console.error(`check-register-parity failed: ${err.message}`);
    process.exit(1);
  });
}
