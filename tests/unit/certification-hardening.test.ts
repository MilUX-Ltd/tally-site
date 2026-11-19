// Certification labels, after the independent review: the build refuses the
// same register wording the data repo's gate refuses, and the page checks a
// link is https again before it renders one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { certificationChecks, slimData } from '../../scripts/fetch-data.mjs';
import { companyCertifications, type CertificationCheck } from '../../src/lib/company-page';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const cyber = data.companies.find((c) => c.name === 'Example Cyber Defence') as Company;
const TODAY = '2026-11-19';

const one = (register: string, link: string | null = null) => ({
  companies: [
    {
      ...raw.companies[0],
      name: 'Checked Ltd',
      tags: ['defence', 'accr-ce-plus'],
      certification_checks: [{ accreditation: 'accr-ce-plus', register, checked: '2026-10-01', link }],
    },
  ],
});
const kept = (register: string, link: string | null = null) =>
  (certificationChecks(one(register, link), taxonomy, TODAY) as Record<string, CertificationCheck[]>)['checked-ltd'] ?? [];

describe('register wording in the build', () => {
  it('drops a register carrying negative or status wording', () => {
    const words = ['not', 'no', 'none', 'unverified', 'expired', 'revoked', 'lapsed', 'withdrawn', 'suspended', 'failed', 'invalid', 'removed', 'found'];
    for (const word of words) {
      for (const register of [`the IASME register ${word}`, `${word.toUpperCase()} on the IASME register`, `the ${word[0].toUpperCase()}${word.slice(1)} register`]) {
        expect(kept(register), register).toEqual([]);
      }
    }
    expect(kept("the IASME register (isn't listed)")).toEqual([]);
  });

  it('keeps plain register names', () => {
    for (const register of ['the IASME register', 'UKAS CertCheck', 'the CREST directory', 'the Northern register', 'the Nottingham register']) {
      expect(kept(register).map((c) => c.register), register).toEqual([register]);
    }
  });

  it('drops a register with a backslash or control character', () => {
    expect(kept('the IASME\\register')).toEqual([]);
    expect(kept('the IASME\tregister')).toEqual([]);
    expect(kept('the IASME\u0000register')).toEqual([]);
  });

  it('accepts an https link whatever its case, as the gate does', () => {
    expect(kept('the IASME register', 'HTTPS://example.org/cert/1').map((c) => c.link)).toEqual(['HTTPS://example.org/cert/1']);
    expect(kept('the IASME register', 'HTTP://example.org/cert/1')).toEqual([]);
    expect(kept('the IASME register', 'https://example.org/a\\b')).toEqual([]);
  });
});

describe('links on the page', () => {
  it('companyCertifications renders a link only when it is https', () => {
    const base = { accreditation: 'accr-ce-plus', register: 'the IASME register', checked: '2026-10-01' };
    for (const link of ['javascript:alert(1)', 'http://example.org/c', 'data:text/html,x', '//example.org/c', 'https://example.org/a b']) {
      const [cert] = companyCertifications(cyber, data.taxonomy, [{ ...base, link }]);
      expect(cert.check?.link, link).toBeNull();
      expect(cert.source).toBe('Checked against the IASME register on 1 October 2026');
    }
    const [safe] = companyCertifications(cyber, data.taxonomy, [{ ...base, link: 'https://example.org/c/1' }]);
    expect(safe.check?.link).toBe('https://example.org/c/1');
  });
});
