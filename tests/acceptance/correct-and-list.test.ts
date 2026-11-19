// Acceptance tests: the "Correct this listing" and "Get listed" mail links.
// Committed failing before the build. Not edited after that commit.
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL, correctionMailto, getListedMailto } from '../../src/lib/contact';

function parse(href: string) {
  expect(href.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true);
  const query = href.slice(href.indexOf('?') + 1);
  // Percent-encoded throughout: no raw spaces, line breaks or plus signs.
  expect(query).not.toMatch(/[ \r\n+]/);
  const params = new URLSearchParams(query);
  return { subject: params.get('subject'), body: params.get('body') ?? '' };
}

describe('mail links', () => {
  it('correction link carries the company name', () => {
    expect(CONTACT_EMAIL).toBe('contact@milux.co.uk');
    const name = 'Smith & Jones "Defence" Ltd #1?';
    const url = 'https://tally.milux.co.uk/companies/smith-and-jones-defence-ltd-1/';
    const { subject, body } = parse(correctionMailto(name, url));
    expect(subject).toBe(`Tally correction: ${name}`);
    expect(body).toContain(url);
    expect(body.length).toBeGreaterThan(url.length + 20);
  });

  it('get listed link has the fixed subject', () => {
    const { subject, body } = parse(getListedMailto());
    expect(subject).toBe('Tally: please list my company');
    expect(body).toMatch(/website/i);
  });
});
