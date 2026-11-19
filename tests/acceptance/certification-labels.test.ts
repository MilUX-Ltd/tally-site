// Acceptance tests: certification labels. Every certification shown for a
// company says where it came from: "Stated by the company" by default, or
// "Checked against <register> on <date>" when a manual check is recorded.
// Nothing ever says or implies that a company is not certified.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { certificationChecks, slimData } from '../../scripts/fetch-data.mjs';
import { certificationLabel, companyCertifications, type CertificationCheck } from '../../src/lib/company-page';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const byName = (name: string) => data.companies.find((c) => c.name === name) as Company;
const TODAY = '2026-11-19';

const NEGATIVE = /\bnot\b|\bno\b|\bnone\b|un(?:certified|verified|confirmed)|fail|invalid|expired|lapsed|revoked|missing|could ?n[o']t|cannot|unable|absent|without/i;

const company = (name: string, tags: string[], checks?: unknown) => ({ ...raw.companies[0], name, tags, certification_checks: checks });

describe('the build keeps only well-formed checks', () => {
  it('keeps only well-formed checks for held accreditations', () => {
    const good = { accreditation: 'accr-ce-plus', register: 'the IASME register', checked: '2026-10-01', link: 'https://example.org/c/1' };
    const tags = ['defence', 'accr-ce-plus', 'accr-iso9001'];
    const input = {
      companies: [
        company('Kept Ltd', tags, [good, { accreditation: 'accr-iso9001', register: 'UKAS CertCheck', checked: '2026-09-30' }]),
        company('Dropped Ltd', tags, [
          { ...good, accreditation: 'accr-crest' }, // not held
          { ...good, accreditation: 'accr-made-up' }, // not in the taxonomy
          { ...good, accreditation: 'accr-iso9001', register: '' },
          { ...good, accreditation: 'accr-iso9001', register: 'r'.repeat(81) },
        ]),
        company('Dates Ltd', tags, [
          { ...good, checked: '2026-13-45' },
          { ...good, accreditation: 'accr-iso9001', checked: '2026-11-20' }, // after the build date
        ]),
        company('Links Ltd', tags, [
          { ...good, link: 'http://example.org/c' },
          { ...good, accreditation: 'accr-iso9001', link: 'javascript:alert(1)' },
        ]),
        company('Shapes Ltd', tags, 'accr-ce-plus'),
        company('Plain Ltd', tags),
      ],
    };
    const checks = certificationChecks(input, taxonomy, TODAY) as Record<string, CertificationCheck[]>;
    expect(checks).toEqual({
      'kept-ltd': [
        { accreditation: 'accr-ce-plus', register: 'the IASME register', checked: '2026-10-01', link: 'https://example.org/c/1' },
        { accreditation: 'accr-iso9001', register: 'UKAS CertCheck', checked: '2026-09-30', link: null },
      ],
    });

    // The fixture: one kept check for each of two companies; the unheld and unsafe ones dropped.
    const fixture = certificationChecks(raw, taxonomy, TODAY) as Record<string, CertificationCheck[]>;
    expect(Object.keys(fixture).sort()).toEqual(['example-cyber-defence', 'example-software-works']);
    expect(fixture['example-cyber-defence']).toEqual([
      { accreditation: 'accr-ce-plus', register: 'the Example certificate register', checked: '2026-10-01', link: 'https://example.org/register/example-cyber-defence' },
    ]);

    // The browser data carries no checks.
    expect(JSON.stringify(data)).not.toContain('certification_checks');
    expect(JSON.stringify(data)).not.toContain('Example certificate register');
  });
});

describe('labels', () => {
  it('labels default to stated by the company', () => {
    expect(certificationLabel(null)).toBe('Stated by the company');
    expect(certificationLabel(undefined)).toBe('Stated by the company');
    const cyber = byName('Example Cyber Defence');
    const list = companyCertifications(cyber, data.taxonomy, undefined);
    expect(list.map((c) => c.label)).toEqual(['Cyber Essentials Plus', 'CREST']);
    expect(list.map((c) => c.source)).toEqual(['Stated by the company', 'Stated by the company']);
    expect(list.every((c) => c.check === null)).toBe(true);
    expect(companyCertifications(byName('Example EW Systems'), data.taxonomy, undefined)).toEqual([]);
  });

  it('a recorded check is labelled with its register and date', () => {
    const check: CertificationCheck = { accreditation: 'accr-ce-plus', register: 'the IASME register', checked: '2026-12-01', link: null };
    expect(certificationLabel(check)).toBe('Checked against the IASME register on 1 December 2026');
    const cyber = byName('Example Cyber Defence');
    const list = companyCertifications(cyber, data.taxonomy, [
      { ...check, checked: '2026-10-01' },
      { accreditation: 'accr-iso27001', register: 'an example register', checked: '2026-10-01', link: null }, // not held: ignored
    ]);
    expect(list.map((c) => [c.label, c.source])).toEqual([
      ['Cyber Essentials Plus', 'Checked against the IASME register on 1 October 2026'],
      ['CREST', 'Stated by the company'],
    ]);
    expect(list[0].check).toEqual({ ...check, checked: '2026-10-01' });
  });

  it('labels never say a company is not certified', () => {
    const odd: Array<CertificationCheck | null | undefined> = [
      null,
      undefined,
      { accreditation: 'accr-ce', register: '', checked: '', link: null },
      { accreditation: 'accr-ce', register: 'the IASME register', checked: 'not a date', link: null },
      { accreditation: 'accr-ce', register: 'the IASME register', checked: '2026-02-30', link: null },
      { accreditation: 'accr-ce', register: 'UKAS CertCheck', checked: '2026-01-01', link: 'https://example.org' },
    ];
    for (const check of odd) {
      const label = certificationLabel(check);
      expect(label).toMatch(/^(Stated by the company|Checked against .+ on \d{1,2} [A-Z][a-z]+ \d{4})$/);
      expect(label.replace(/^Checked against (.+) on /, 'Checked against REGISTER on ')).not.toMatch(NEGATIVE);
    }
    // A check that cannot be read falls back to the company's own statement.
    expect(certificationLabel(odd[3])).toBe('Stated by the company');
    expect(certificationLabel(odd[4])).toBe('Stated by the company');
    for (const c of data.companies) {
      for (const cert of companyCertifications(c, data.taxonomy, undefined)) expect(cert.source).not.toMatch(NEGATIVE);
    }
  });
});
