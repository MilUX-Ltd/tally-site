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
import { companyIds, slimTaxonomy } from './fetch-data.mjs';

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
 * @param {{ month: string, carried?: boolean, companies: { tags?: string[] }[] }[]} snapshots
 * @param {object} taxonomy raw taxonomy.json
 */
export function historyFromSnapshots(snapshots, taxonomy) {
  const t = slimTaxonomy(taxonomy);
  const groupOf = new Map(t.capabilities.map((c) => [c.slug, c.group]));
  const months = snapshots.map(({ month, carried = false, companies }) => {
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
    return { month, carried, total: companies.length, groups };
  });
  return { groups: t.groups.map((g) => ({ slug: g.slug, label: g.label })), months };
}

// Added dates: when each company was first listed. A company is matched across
// snapshots by its name in lower case without accents or punctuation, "&" as
// "and", and a trailing Limited, Ltd, PLC, LLP, Inc or LLC ignored, so a
// Limited-to-Ltd rename keeps its first date.
const LEGAL_SUFFIX = /(?:\s(?:limited|ltd|plc|llp|inc|llc))+$/;

/** The key a company's name is matched by across snapshots. */
export function nameKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(LEGAL_SUFFIX, '');
}

/** An ISO date in UTC to the second, for example 2026-06-29T11:20:37Z. */
const utc = (date) => new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * The date each company was first listed, by company id.
 * @param {{ id: string, name: string }[]} companies today's companies
 * @param {{ date: string, names: string[] }[]} snapshots oldest first
 * @returns {Record<string, string>} id to ISO date (UTC); companies never seen are left out
 */
export function addedDates(companies, snapshots) {
  const first = new Map();
  for (const s of snapshots) {
    const when = utc(s.date);
    for (const n of s.names) {
      const key = nameKey(n);
      if (key && !first.has(key)) first.set(key, when);
    }
  }
  const out = {};
  for (const c of companies) {
    const when = first.get(nameKey(c.name));
    if (when) out[c.id] = when;
  }
  return out;
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
      return { month: p.month, carried: p.carried, companies: cache.get(p.sha) };
    });
    const taxonomy = JSON.parse(git('show', `HEAD:taxonomy.json`));
    // Added dates: every first-parent commit on main that touches the data,
    // oldest first, so a merged pull request counts from its merge. Only
    // commit dates and company names are read; never messages or authors.
    const mainline = git('log', '--first-parent', '--reverse', '--format=%H %cI', '--', FILE)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, date] = line.split(' ');
        return { date, names: companiesOf(JSON.parse(git('show', `${sha}:${FILE}`))).map((c) => c.name) };
      });
    return { history: historyFromSnapshots(snapshots, taxonomy), mainline };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const readFixture = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));

/** The synthetic history in tests/fixtures: commits that each list the fixture companies present then. */
export function fromFixture() {
  const read = readFixture;
  const data = read('tally-data.json');
  const { commits } = read('history.json');
  const byName = new Map(companiesOf(data).map((c) => [c.name, c]));
  const picked = pickMonthly(commits);
  const shaNames = new Map(commits.map((c) => [c.sha, c.companies]));
  const snapshots = picked.map((p) => ({ month: p.month, carried: p.carried, companies: shaNames.get(p.sha).map((n) => byName.get(n)).filter(Boolean) }));
  return historyFromSnapshots(snapshots, read('taxonomy.json'));
}

/** Added dates for the fixture companies, from the synthetic history. */
export function addedFromFixture() {
  const { commits } = readFixture('history.json');
  const ordered = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
  const companies = companiesOf(readFixture('tally-data.json'));
  const ids = companyIds(companies);
  return addedDates(
    companies.map((c, i) => ({ id: ids[i], name: c.name })),
    ordered.map((c) => ({ date: c.date, names: c.companies })),
  );
}

async function main() {
  const fixture = process.env.TALLY_DATA_SOURCE === 'fixture';
  const fromRepo = fixture ? null : fromGit();
  const history = { generated: new Date().toISOString(), ...(fixture ? fromFixture() : fromRepo.history) };
  if (!history.months.length) throw new Error('no history found; refusing to write an empty file');
  const dir = new URL('../public/data/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(history);
  writeFileSync(new URL('history.json', dir), json);
  const span = `${history.months[0].month} to ${history.months.at(-1).month}`;
  console.log(`Wrote public/data/history.json from ${fixture ? 'the test fixture' : 'the data repo history'}: ${history.months.length} months (${span}), ${json.length} bytes.`);

  // Added dates, joined to today's company ids from public/data/tally.json
  // (written by fetch-data.mjs, which runs first). Build-only, never served.
  const today = JSON.parse(readFileSync(new URL('tally.json', dir), 'utf8'));
  const added = fixture ? addedFromFixture() : addedDates(today.companies, fromRepo.mainline);
  const missing = today.companies.length - Object.keys(added).length;
  const buildDir = new URL('../.tally/', import.meta.url);
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(new URL('added.json', buildDir), JSON.stringify(added));
  console.log(`Wrote .tally/added.json: ${Object.keys(added).length} companies dated${missing ? `, ${missing} not yet in the history (left off the new companies list)` : ''}.`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  main().catch((err) => {
    console.error(`build-history failed: ${err.message}`);
    process.exit(1);
  });
}
