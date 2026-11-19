import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertAddedDatesSane } from '../../scripts/build-history.mjs';
import { compare, gatePattern, sitePattern } from '../../scripts/check-register-parity.mjs';

const dated = (spread: string[]) => Object.fromEntries(spread.map((d, i) => [`c${i}`, d]));

describe('added dates sanity guard', () => {
  it('accepts a history spread over months', () => {
    const added = dated(['2026-06-29T11:20:37Z', '2026-07-10T09:00:00Z', '2026-09-01T09:00:00Z', '2026-11-19T17:56:45Z']);
    expect(() => assertAddedDatesSane(added, 40)).not.toThrow();
  });

  it('refuses when the mainline has no commits', () => {
    expect(() => assertAddedDatesSane({}, 0)).toThrow(/no commits/);
  });

  it('refuses when nothing could be dated', () => {
    expect(() => assertAddedDatesSane({}, 3)).toThrow(/no company could be dated/);
  });

  it('refuses when more than half are dated in the newest week', () => {
    const added = dated(['2026-06-29T11:20:37Z', '2026-11-14T10:00:00Z', '2026-11-18T10:00:00Z', '2026-11-19T17:56:45Z']);
    expect(() => assertAddedDatesSane(added, 1)).toThrow(/3 of 4 companies/);
  });

  it('accepts exactly half in the newest week', () => {
    const added = dated(['2026-06-29T11:20:37Z', '2026-08-01T10:00:00Z', '2026-11-18T10:00:00Z', '2026-11-19T17:56:45Z']);
    expect(() => assertAddedDatesSane(added, 2)).not.toThrow();
  });
});

const GATE = `REGISTER_DENIED = re.compile(
    r"\\b(?:not|no|none|unverified|unconfirmed|uncertified|expired|revoked|lapsed|withdrawn|suspended|"
    r"fail|failed|failure|invalid|removed|found|missing|cancelled|canceled)\\b|n['’]t\\b",
    re.I,
)
`;

describe('register wording parity', () => {
  const site = sitePattern(readFileSync(new URL('../../scripts/fetch-data.mjs', import.meta.url), 'utf8'));

  it('matches the gate list as it stands', () => {
    expect(compare(site, gatePattern(GATE))).toEqual([]);
  });

  it('reports a word added to the gate only', () => {
    expect(compare(site, gatePattern(GATE.replace('|missing|', '|missing|lapsing|')))).toHaveLength(1);
  });

  it('reports a change in case sensitivity', () => {
    expect(compare(site, gatePattern(GATE.replace('re.I,', '0,')))).toEqual(['case sensitivity differs']);
  });
});

describe('feed text', () => {
  it('drops lone surrogates and keeps valid pairs', async () => {
    const { xmlEscape } = await import('../../src/lib/new-companies');
    expect(xmlEscape('A\uD800B\uDC00C \u{1F680} & D')).toBe('ABC \u{1F680} &amp; D');
  });
});

