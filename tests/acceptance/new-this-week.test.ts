// Acceptance tests: the new companies page and its RSS feed. Added dates from
// the data history, grouping by week, and feed validity.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addedDates, addedFromFixture } from '../../scripts/build-history.mjs';
import { slimData } from '../../scripts/fetch-data.mjs';
import { feedXml, recentAdditions, regionText, weekStart } from '../../src/lib/new-companies';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const byName = (name: string) => data.companies.find((c) => c.name === name) as Company;

/**
 * A strict well-formedness check for the XML the feed uses: balanced,
 * properly nested elements, quoted attributes, and no bare & or < in text.
 * Returns the problems found (an empty list when well formed).
 */
function xmlProblems(xml: string): string[] {
  const problems: string[] = [];
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  const stack: string[] = [];
  const token = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos);[^"<&]*)*")*)\s*(\/?)>/y;
  let i = 0;
  let roots = 0;
  while (i < body.length) {
    const lt = body.indexOf('<', i);
    const text = body.slice(i, lt === -1 ? body.length : lt);
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) problems.push(`bare & in text: ${text.slice(0, 60)}`);
    if (stack.length === 0 && text.trim()) problems.push(`text outside the root: ${text.slice(0, 60)}`);
    if (lt === -1) break;
    token.lastIndex = lt;
    const m = token.exec(body);
    if (!m) {
      problems.push(`malformed markup at ${lt}: ${body.slice(lt, lt + 60)}`);
      break;
    }
    const [, close, name, , selfClose] = m;
    if (close) {
      if (stack.pop() !== name) problems.push(`mismatched </${name}>`);
    } else if (!selfClose) {
      if (stack.length === 0) roots++;
      stack.push(name);
    } else if (stack.length === 0) roots++;
    i = token.lastIndex;
  }
  if (stack.length) problems.push(`unclosed: ${stack.join(', ')}`);
  if (roots !== 1) problems.push(`expected one root element, found ${roots}`);
  return problems;
}

describe('added dates', () => {
  it('added dates come from the first snapshot that lists a company', () => {
    const snapshots = [
      { date: '2026-06-29T12:20:37+01:00', names: ['Acme Limited', 'Bravo & Sons'] },
      { date: '2026-07-01T00:30:00+01:00', names: ['Acme Ltd', 'Bravo and Sons', 'Charlie'] },
      { date: '2026-08-01T10:00:00Z', names: ['ACME LTD.', 'Bravo and Sons'] },
      { date: '2026-09-01T10:00:00Z', names: ['Acme Ltd', 'Bravo and Sons', 'Charlie', 'Delta'] },
    ];
    const companies = [
      { id: 'acme-ltd', name: 'Acme Ltd' },
      { id: 'bravo-and-sons', name: 'Bravo and Sons' },
      { id: 'charlie', name: 'Charlie' },
      { id: 'delta', name: 'Delta' },
      { id: 'echo', name: 'Echo' },
    ];
    expect(addedDates(companies, snapshots)).toEqual({
      'acme-ltd': '2026-06-29T11:20:37Z',
      'bravo-and-sons': '2026-06-29T11:20:37Z',
      charlie: '2026-06-30T23:30:00Z',
      delta: '2026-09-01T10:00:00Z',
    });
  });

  it('fixture companies get their dates from the fixture history', () => {
    const added = addedFromFixture() as Record<string, string>;
    expect(Object.keys(added)).toHaveLength(data.companies.length);
    expect(added['example-aerial-systems']).toBe('2026-06-29T11:20:37Z');
    expect(added['example-secure-comms']).toBe('2026-07-29T09:36:56Z');
    expect(added['example-software-works']).toBe('2026-10-15T07:45:59Z');
    expect(added['example-vehicles']).toBe('2026-11-19T16:32:14Z');
    expect(added['example-unplaced-ltd']).toBe('2026-11-19T16:32:14Z');
  });
});

describe('recent additions', () => {
  it('recent additions are grouped by week, newest first', () => {
    expect(weekStart('2026-11-16T00:00:00Z')).toBe('2026-11-16');
    expect(weekStart('2026-11-22T23:59:59Z')).toBe('2026-11-16');
    expect(weekStart('2026-11-23T00:00:00Z')).toBe('2026-11-23');

    const weeks = recentAdditions(data.companies, addedFromFixture() as Record<string, string>, data.taxonomy);
    const shape = weeks.map((w) => ({
      week: w.week,
      label: w.label,
      entries: w.entries.map((e) => ({ name: e.name, path: e.path, region: e.region, capabilities: e.capabilities, added: e.added })),
    }));
    expect(shape).toEqual([
      {
        week: '2026-11-16',
        label: 'Week of 16 November 2026',
        entries: [
          { name: 'Example Unplaced Ltd', path: '/companies/example-unplaced-ltd/', region: 'Region not known', capabilities: ['Software'], added: '2026-11-19T16:32:14Z' },
          { name: 'Example Vehicles', path: '/companies/example-vehicles/', region: 'West Midlands', capabilities: ['Land', 'Vehicles', 'Mechanical Engineering'], added: '2026-11-19T16:32:14Z' },
        ],
      },
      {
        week: '2026-10-12',
        label: 'Week of 12 October 2026',
        entries: [
          { name: 'Example Software Works', path: '/companies/example-software-works/', region: 'North West', capabilities: ['Cloud', 'Software'], added: '2026-10-15T07:45:59Z' },
          { name: 'Example Space Systems', path: '/companies/example-space-systems/', region: 'Scotland', capabilities: ['Satellite', 'Space'], added: '2026-10-15T07:45:59Z' },
          { name: 'Example Subsea', path: '/companies/example-subsea/', region: 'Scotland', capabilities: ['Maritime', 'Autonomy', 'Robotics'], added: '2026-10-15T07:45:59Z' },
          { name: 'Example Training Simulation', path: '/companies/example-training-simulation/', region: 'Northern Ireland', capabilities: ['Simulation', 'Training'], added: '2026-10-15T07:45:59Z' },
        ],
      },
    ]);

    // The window is the 12 weeks up to the week of the newest addition.
    const edge = recentAdditions(
      data.companies,
      { 'example-vehicles': '2026-11-19T16:32:14Z', 'example-subsea': '2026-08-31T00:00:00Z', 'example-quantum': '2026-08-30T23:59:59Z' },
      data.taxonomy,
    );
    expect(edge.flatMap((w) => w.entries.map((e) => e.name))).toEqual(['Example Vehicles', 'Example Subsea']);
    expect(edge.map((w) => w.week)).toEqual(['2026-11-16', '2026-08-31']);

    expect(regionText({ ...byName('Example Vehicles'), region: 'Overseas', country: 'Norway' })).toBe('Norway');
    expect(recentAdditions(data.companies, {}, data.taxonomy)).toEqual([]);
  });
});

describe('feed', () => {
  it('feed is well-formed RSS with escaped text and absolute links', () => {
    const nasty = data.companies.map((c) =>
      c.name === 'Example Vehicles'
        ? { ...c, name: 'Smith & Jones <Defence> "Ltd"', summary: "Bolts & nuts <b>bold</b> it's <script>x</script>" }
        : c,
    );
    const weeks = recentAdditions(nasty, addedFromFixture() as Record<string, string>, data.taxonomy);
    const xml = feedXml(weeks);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
    expect(xmlProblems(xml)).toEqual([]);

    expect(xml).toContain('<title>Smith &amp; Jones &lt;Defence&gt; &quot;Ltd&quot;</title>');
    expect(xml).toContain('Bolts &amp; nuts &lt;b&gt;bold&lt;/b&gt; it&apos;s &lt;script&gt;x&lt;/script&gt;');
    expect(xml).not.toContain('<b>');
    expect(xml).not.toContain('<script');
    expect(xml).not.toContain('CDATA');

    expect(xml).toContain('<link>https://tally.milux.co.uk/new/</link>');
    expect(xml).toContain('<atom:link href="https://tally.milux.co.uk/new/feed.xml" rel="self" type="application/rss+xml"/>');
    const links = [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((m) => m[1]);
    const guids = [...xml.matchAll(/<guid[^>]*>([^<]*)<\/guid>/g)].map((m) => m[1]);
    expect(links.length).toBe(7);
    expect(guids.length).toBe(6);
    for (const url of [...links, ...guids]) expect(url).toMatch(/^https:\/\/tally\.milux\.co\.uk\/[a-z0-9/-]*$/);
    // Links come from the company id, never from the name or data URLs.
    expect(xml).toContain('<link>https://tally.milux.co.uk/companies/example-vehicles/</link>');

    // Items carry only the public fields, newest first, dated from the data.
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    expect(items).toHaveLength(6);
    for (const item of items) {
      const names = new Set([...item.matchAll(/<([A-Za-z][\w:]*)[\s>]/g)].map((m) => m[1]));
      for (const n of names) expect(['title', 'link', 'guid', 'pubDate', 'description', 'category']).toContain(n);
    }
    expect(items[0]).toContain('<title>Example Unplaced Ltd</title>');
    expect(items[0]).toContain('<pubDate>Thu, 19 Nov 2026 16:32:14 GMT</pubDate>');
    expect(items[1]).toContain('<category>Mechanical Engineering</category>');
    expect(items[1]).toContain('West Midlands');
    expect(xml).toContain('<lastBuildDate>Thu, 19 Nov 2026 16:32:14 GMT</lastBuildDate>');
  });
});
