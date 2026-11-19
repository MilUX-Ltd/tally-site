// Acceptance tests: a page for each company. Slugs, extracted text, safe
// Markdown, capability groups, location and the sitemap.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { companySections, companyTexts, slimData } from '../../scripts/fetch-data.mjs';
import {
  canonicalUrl,
  capabilityGroups,
  companyLocation,
  companyPath,
  metaDescription,
  pageTitle,
  parseMarkdown,
  shortlistHref,
  sitemapXml,
  type Block,
  type Inline,
} from '../../src/lib/company-page';
import type { Company, TallyData } from '../../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
const data = slimData(raw, taxonomy) as TallyData;
const byName = (name: string) => data.companies.find((c) => c.name === name) as Company;

/** Every inline node, depth first. */
function inlines(blocks: Block[]): Inline[] {
  const out: Inline[] = [];
  const walk = (list: Inline[]) => {
    for (const n of list) {
      out.push(n);
      if ('children' in n) walk(n.children);
    }
  };
  for (const b of blocks) {
    if (b.type === 'p') walk(b.inlines);
    else for (const item of b.items) walk(item);
  }
  return out;
}
const plain = (blocks: Block[]) =>
  inlines(blocks)
    .filter((n): n is Extract<Inline, { type: 'text' }> => n.type === 'text')
    .map((n) => n.text)
    .join('');

describe('page slugs', () => {
  it('page slugs are the shortlist ids', () => {
    const twins = {
      companies: [
        { ...raw.companies[0], name: 'Acme & Sons' },
        { ...raw.companies[1], name: 'Acme and Sons' },
        { ...raw.companies[2], name: 'Zed Ltd.' },
      ],
    };
    const slim = slimData(twins, taxonomy) as TallyData;
    const texts = companyTexts(twins) as Record<string, unknown>;
    expect(slim.companies.map((c) => c.id).sort()).toEqual(['acme-and-sons', 'acme-and-sons-2', 'zed-ltd']);
    expect(Object.keys(texts).sort()).toEqual(['acme-and-sons', 'acme-and-sons-2', 'zed-ltd']);
    for (const c of slim.companies) expect(companyPath(c.id)).toBe(`/companies/${c.id}/`);
    expect(canonicalUrl(companyPath('zed-ltd'))).toBe('https://tally.milux.co.uk/companies/zed-ltd/');
  });
});

describe('company text', () => {
  it('extracts the sections and verified date', () => {
    const cyber = raw.companies.find((c: { name: string }) => c.name === 'Example Cyber Defence');
    const s = companySections(cyber.body);
    expect(s.what).toContain('tests **networks**');
    expect(s.what).not.toContain('## ');
    expect(s.products).toContain('Red Team Kit');
    expect(s.products).not.toContain('Website:');
    expect(s.verified).toBe('2026-06-29');
    expect(JSON.stringify(s)).not.toContain('must not reach the browser');

    expect(companySections('# Bare\n')).toEqual({ what: '', products: '', verified: null });
    expect(companySections('## Sources\n\nPublic information verified 2026-13-45.').verified).toBeNull();

    const texts = companyTexts(raw) as Record<string, { what: string; products: string; verified: string | null }>;
    expect(Object.keys(texts).sort()).toEqual(data.companies.map((c) => c.id).sort());
    expect(texts['example-cyber-defence'].verified).toBe('2026-06-29');
    // The browser's data does not grow.
    expect(JSON.stringify(data)).not.toContain('Red Team Kit');
  });

  it('markdown is limited to safe elements and http links', () => {
    const blocks = parseMarkdown(
      [
        'We make **radars** and *sonar*. See [our site](https://example.com/a?b=1&c=2) or [plain](http://example.org).',
        '',
        '<script>alert(1)</script> <img src=x onerror=alert(1)> [js](javascript:alert(1)) [data](data:text/html,x) [mail](mailto:a@b.c)',
        '',
        '- **One** - first',
        '* Two with [link](https://example.com/two)',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual(['p', 'p', 'ul']);
    const all = inlines(blocks);
    const links = all.filter((n): n is Extract<Inline, { type: 'link' }> => n.type === 'link');
    expect(links.map((l) => l.href)).toEqual(['https://example.com/a?b=1&c=2', 'http://example.org', 'https://example.com/two']);
    expect(all.some((n) => n.type === 'strong')).toBe(true);
    expect(all.some((n) => n.type === 'em')).toBe(true);
    // Raw HTML and unsafe links survive only as text.
    const text = plain(blocks);
    expect(text).toContain('<script>alert(1)</script>');
    expect(text).toContain('onerror=alert(1)');
    expect(text).toContain('js');
    expect(text).toContain('mail');
    expect(new Set(all.map((n) => n.type))).toEqual(new Set(['text', 'strong', 'em', 'link']));
    const list = blocks[2];
    expect(list.type === 'ul' && list.items.length).toBe(2);
    expect(parseMarkdown('')).toEqual([]);
  });
});

describe('the page model', () => {
  it('groups capabilities by capability group in taxonomy order', () => {
    const groups = capabilityGroups(byName('Example Cyber Defence'), data.taxonomy);
    expect(groups.map((g) => g.slug)).toEqual(['cyber-data-software']);
    expect(groups[0].label).toBe('Cyber, data and software');
    expect(groups[0].capabilities).toEqual(['Cyber', 'Cyber / Pen Testing']);
    const vehicles = capabilityGroups(byName('Example Vehicles'), data.taxonomy).map((g) => g.slug);
    const order = data.taxonomy.groups.map((g) => g.slug);
    expect([...vehicles].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(vehicles);
  });

  it('overseas and unplaced companies have no map point', () => {
    const london = companyLocation(byName('Example Cyber Defence'));
    expect(london.point).not.toBeNull();
    expect(london.text).toContain('London');
    const nordic = companyLocation(byName('Example Nordic Defence'));
    expect(nordic.point).toBeNull();
    expect(nordic.text).toContain('Norway');
    const unplaced = companyLocation(byName('Example Unplaced Ltd'));
    expect(unplaced.point).toBeNull();
    expect(unplaced.text).toMatch(/not known/i);
  });

  it('region-level companies show text, not a point', () => {
    const regional: Company = { ...byName('Example Robotics'), location_source: 'region', lat: 53.48, lon: -2.24, hq: '' };
    const where = companyLocation(regional);
    expect(where.point).toBeNull();
    expect(where.text).toContain('North West');
  });

  it('company pages have titles, descriptions and canonical URLs', () => {
    const c = byName('Example Cyber Defence');
    expect(pageTitle(c)).toContain('Example Cyber Defence');
    expect(pageTitle(c)).toContain('Tally');
    expect(metaDescription(c)).toContain('Example Cyber Defence is a synthetic company');
    const long = metaDescription({ ...c, summary: 'word '.repeat(100) });
    expect(long.length).toBeLessThanOrEqual(160);
    expect(metaDescription({ ...c, summary: '' }).length).toBeGreaterThan(20);
  });

  it('add to shortlist keeps the shortlist the visitor came with', () => {
    const origin = 'https://tally.milux.co.uk';
    expect(shortlistHref('zed-ltd', '', origin)).toBe('/?list=zed-ltd');
    expect(shortlistHref('zed-ltd', 'https://elsewhere.example/?list=a', origin)).toBe('/?list=zed-ltd');
    const kept = new URL(shortlistHref('zed-ltd', `${origin}/?cap=cyber&list=acme,bad%20id`, origin), origin);
    expect(kept.pathname).toBe('/');
    expect(kept.searchParams.get('cap')).toBe('cyber');
    expect(kept.searchParams.get('list')).toBe('acme,zed-ltd');
    const again = new URL(shortlistHref('zed-ltd', `${origin}/?list=zed-ltd`, origin), origin);
    expect(again.searchParams.get('list')).toBe('zed-ltd');
    // A referrer from another page on the site is not the explorer.
    expect(shortlistHref('zed-ltd', `${origin}/events/?list=a`, origin)).toBe('/?list=zed-ltd');
  });
});

describe('sitemap', () => {
  it('sitemap lists every page', () => {
    const xml = sitemapXml(['/', '/about/', '/companies/a-and-b/']);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://tally.milux.co.uk/</loc>');
    expect(xml).toContain('<loc>https://tally.milux.co.uk/about/</loc>');
    expect(xml).toContain('<loc>https://tally.milux.co.uk/companies/a-and-b/</loc>');
    expect(sitemapXml(['/x&y/'])).toContain('/x&amp;y/');
  });
});
