// Acceptance tests: shortlist, URL and CSV export.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimData } from '../../scripts/fetch-data.mjs';
import { addToShortlist, CSV_COLUMNS, MAX_SHORTLIST, removeFromShortlist, shortlistCsv } from '../../src/lib/shortlist';
import { defaultState, fromQuery, sanitiseState, toQuery } from '../../src/lib/url-state';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const byName = (name: string) => data.companies.find((c) => c.name === name) as Company;

// Parses CSV (RFC 4180) so the tests check what a spreadsheet would read.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('shortlist', () => {
  it('adds and removes companies without duplicates', () => {
    let list: string[] = [];
    list = addToShortlist(list, 'example-robotics');
    list = addToShortlist(list, 'example-subsea');
    list = addToShortlist(list, 'example-robotics');
    expect(list).toEqual(['example-robotics', 'example-subsea']);
    list = removeFromShortlist(list, 'example-robotics');
    expect(list).toEqual(['example-subsea']);
    expect(removeFromShortlist(list, 'not-there')).toEqual(['example-subsea']);
    expect(MAX_SHORTLIST).toBeGreaterThanOrEqual(50);
    let big: string[] = [];
    for (let i = 0; i < MAX_SHORTLIST + 10; i++) big = addToShortlist(big, `c-${i}`);
    expect(big).toHaveLength(MAX_SHORTLIST);
  });

  it('keeps the shortlist in the URL', () => {
    const state = { ...defaultState(), list: ['example-robotics', 'example-subsea'] };
    expect(toQuery(state)).toBe('list=example-robotics,example-subsea');
    expect(fromQuery(toQuery(state))).toEqual(state);
    expect(sanitiseState(fromQuery('list=example-robotics,nobody,Bad%20Id'), data).list).toEqual(['example-robotics']);
  });

  it('exports the documented CSV columns', () => {
    expect(CSV_COLUMNS).toEqual([
      'Name',
      'Website',
      'LinkedIn',
      'Headquarters',
      'Region',
      'Country',
      'Postcode',
      'Location source',
      'Size',
      'Capabilities',
      'Accreditations',
      'Frameworks',
      'Memberships',
      'Summary',
    ]);
    const companies = [byName('Example Subsea'), byName('Example Cyber Defence')];
    const rows = parseCsv(shortlistCsv(companies, data.taxonomy));
    expect(rows[0]).toEqual(CSV_COLUMNS);
    expect(rows).toHaveLength(3);
    expect(rows[1][0]).toBe('Example Subsea');
    expect(rows[2][0]).toBe('Example Cyber Defence');
    expect(rows[2][1]).toBe(byName('Example Cyber Defence').website);
    expect(rows[2][4]).toBe('London');
    expect(rows[2][8]).toBe('Small');
    expect(rows[2][9]).toContain('Cyber');
    expect(rows[2][10]).toContain('Cyber Essentials Plus');
    expect(rows[2][11]).toContain('G-Cloud');
    expect(rows[2][12]).toContain('techUK');
    for (const r of rows) expect(r).toHaveLength(CSV_COLUMNS.length);
  });

  it('escapes CSV values safely', () => {
    const tricky: Company = {
      ...byName('Example Robotics'),
      name: '=HYPERLINK("http://bad.example","click")',
      summary: 'Commas, "quotes"\nand a new line',
      hq: '+44 trick',
      region: '@SUM(A1)',
      postcode: '-1',
    };
    const rows = parseCsv(shortlistCsv([tricky], data.taxonomy));
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe(`'=HYPERLINK("http://bad.example","click")`);
    expect(rows[1][3]).toBe(`'+44 trick`);
    expect(rows[1][4]).toBe(`'@SUM(A1)`);
    expect(rows[1][6]).toBe(`'-1`);
    expect(rows[1][13]).toBe('Commas, "quotes"\nand a new line');
  });
});
