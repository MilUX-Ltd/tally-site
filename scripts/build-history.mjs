// Build step: replay the directory's growth from the data repo's git history.
// Clones MilUX-Ltd/tally with full history, takes one snapshot of
// tally-data.json per month (the last commit touching it in that month; a
// month with no commit carries the previous one forward), counts companies
// overall and per capability group, and writes public/data/history.json
// (git-ignored). With TALLY_DATA_SOURCE=fixture it reads the synthetic history
// in tests/fixtures instead, so tests never touch the network.
// Usage: node scripts/build-history.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slimTaxonomy } from './fetch-data.mjs';

const REPO = 'https://github.com/MilUX-Ltd/tally';
const FILE = 'tally-data.json';

const monthOf = (date) => new Date(date).toISOString().slice(0, 7);
function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * One commit per month: the latest in each calendar month (UTC), months in
 * order, a month with no commit filled from the month before.
 * @param {{ sha: string, date: string }[]} commits in any order
 * @returns {{ month: string, sha: string, date: string, carried: boolean }[]}
 */
export function pickMonthly(commits) {
  const latest = new Map();
  for (const c of commits) {
    const month = monthOf(c.date);
    const prev = latest.get(month);
    if (!prev || new Date(c.date) > new Date(prev.date)) latest.set(month, c);
  }
  const months = [...latest.keys()].sort();
  if (!months.length) return [];
  const out = [];
  let last = null;
  for (let m = months[0]; m <= months[months.length - 1]; m = nextMonth(m)) {
    const c = latest.get(m);
    if (c) last = c;
    out.push({ month: m, sha: last.sha, date: last.date, carried: !c });
  }
  return out;
}

/**
 * Counts per month: the total, and companies per capability group (once per
 * group; a sub-capability counts for its group). Tags are read through the
 * given taxonomy, so tags it does not know are not counted.
 * @param {{ month: string, companies: { tags?: string[] }[] }[]} snapshots
 * @param {object} taxonomy raw taxonomy.json
 */
export function historyFromSnapshots(snapshots, taxonomy) {
  const t = slimTaxonomy(taxonomy);
  const groupOf = new Map(t.capabilities.map((c) => [c.slug, c.group]));
  const months = snapshots.map(({ month, companies }) => {
    const groups = Object.fromEntries(t.groups.map((g) => [g.slug, 0]));
    for (const c of companies) {
      const seen = new Set();
      for (const tag of Array.isArray(c.tags) ? c.tags : []) {
        if (typeof tag !== 'string') continue;
        const g = groupOf.get(tag) ?? groupOf.get(tag.split('/')[0]);
        if (g && !seen.has(g) && g in groups) {
          seen.add(g);
          groups[g]++;
        }
      }
    }
    return { month, total: companies.length, groups };
  });
  return { groups: t.groups.map((g) => ({ slug: g.slug, label: g.label })), months };
}

const companiesOf = (raw) => (Array.isArray(raw?.companies) ? raw.companies : []);

function fromGit() {
  const dir = mkdtempSync(join(tmpdir(), 'tally-history-'));
  try {
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    execFileSync('git', ['clone', '--quiet', '--no-checkout', REPO, dir], { stdio: ['ignore', 'ignore', 'inherit'] });
    const commits = git('log', '--format=%H %cI', '--', FILE)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, date] = line.split(' ');
        return { sha, date };
      });
    const picked = pickMonthly(commits);
    const cache = new Map();
    const snapshots = picked.map((p) => {
      if (!cache.has(p.sha)) cache.set(p.sha, companiesOf(JSON.parse(git('show', `${p.sha}:${FILE}`))));
      return { month: p.month, companies: cache.get(p.sha) };
    });
    const taxonomy = JSON.parse(git('show', `HEAD:taxonomy.json`));
    return historyFromSnapshots(snapshots, taxonomy);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The synthetic history in tests/fixtures: commits that each list the fixture companies present then. */
export function fromFixture() {
  const read = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));
  const data = read('tally-data.json');
  const { commits } = read('history.json');
  const byName = new Map(companiesOf(data).map((c) => [c.name, c]));
  const picked = pickMonthly(commits);
  const shaNames = new Map(commits.map((c) => [c.sha, c.companies]));
  const snapshots = picked.map((p) => ({ month: p.month, companies: shaNames.get(p.sha).map((n) => byName.get(n)).filter(Boolean) }));
  return historyFromSnapshots(snapshots, read('taxonomy.json'));
}

async function main() {
  const fixture = process.env.TALLY_DATA_SOURCE === 'fixture';
  const history = { generated: new Date().toISOString(), ...(fixture ? fromFixture() : fromGit()) };
  if (!history.months.length) throw new Error('no history found; refusing to write an empty file');
  const dir = new URL('../public/data/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(history);
  writeFileSync(new URL('history.json', dir), json);
  const span = `${history.months[0].month} to ${history.months.at(-1).month}`;
  console.log(`Wrote public/data/history.json from ${fixture ? 'the test fixture' : 'the data repo history'}: ${history.months.length} months (${span}), ${json.length} bytes.`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  main().catch((err) => {
    console.error(`build-history failed: ${err.message}`);
    process.exit(1);
  });
}
