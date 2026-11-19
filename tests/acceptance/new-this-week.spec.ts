// Acceptance journeys: the new companies page and its RSS feed. Fixture build.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addedFromFixture } from '../../scripts/build-history.mjs';
import { slimData } from '../../scripts/fetch-data.mjs';
import { feedXml, recentAdditions } from '../../src/lib/new-companies';
import type { TallyData } from '../../src/lib/types';
import { AXE_TAGS, useOfflineMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

const NAMES = [
  'Example Unplaced Ltd',
  'Example Vehicles',
  'Example Software Works',
  'Example Space Systems',
  'Example Subsea',
  'Example Training Simulation',
];

/** Parses XML in the browser; returns the parser error text, the item titles and links. */
async function parseInBrowser(page: Page, xml: string) {
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const error = doc.querySelector('parsererror');
    const items = [...doc.querySelectorAll('channel > item')];
    return {
      error: error ? error.textContent : null,
      root: doc.documentElement.nodeName,
      version: doc.documentElement.getAttribute('version'),
      titles: items.map((i) => i.querySelector('title')?.textContent ?? ''),
      links: items.map((i) => i.querySelector('link')?.textContent ?? ''),
    };
  }, xml);
}

test('new companies page lists additions by week', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('Content Security Policy')) violations.push(m.text());
  });
  await page.goto('/new');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New companies');
  expect((await page.getByRole('heading', { level: 2 }).allInnerTexts()).map((t) => t.trim())).toEqual(
    expect.arrayContaining(['Week of 16 November 2026', 'Week of 12 October 2026']),
  );
  expect((await page.locator('.new-company h3').allInnerTexts()).map((t) => t.trim())).toEqual(NAMES);
  await expect(page.getByText('Example Secure Comms')).toHaveCount(0);

  const vehicles = page.locator('.new-company', { hasText: 'Example Vehicles' });
  await expect(vehicles.getByRole('link', { name: 'Example Vehicles' })).toHaveAttribute('href', '/companies/example-vehicles/');
  await expect(vehicles).toContainText('West Midlands');
  await expect(vehicles).toContainText('Land');
  await expect(vehicles).toContainText('Vehicles');
  await expect(vehicles).toContainText('Mechanical Engineering');
  await expect(vehicles).toContainText('19 November 2026');

  // The feed is linked from the page and from the head.
  await expect(page.getByRole('link', { name: /rss feed/i })).toHaveAttribute('href', '/new/feed.xml');
  await expect(page.locator('head link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', '/new/feed.xml');

  expect(await page.locator('script:not([src])').count()).toBe(0);
  expect(await page.locator('style').count()).toBe(0);
  expect(violations).toEqual([]);

  // Following a name opens the company page.
  await vehicles.getByRole('link', { name: 'Example Vehicles' }).click();
  await expect(page).toHaveURL(/\/companies\/example-vehicles\/$/);

  // Linked from the explorer header, which also advertises the feed.
  await page.goto('/');
  await expect(page.locator('.site-header').getByRole('link', { name: /new companies/i })).toHaveAttribute('href', '/new');
  await expect(page.locator('head link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', '/new/feed.xml');
});

test('new companies page is accessible at desktop and phone width', async ({ page }) => {
  await page.goto('/new');
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/new');
  await noSideScroll(page);
  await expectNoAxeViolations(page);
});

test('the built feed parses and matches the page', async ({ page, request }) => {
  const response = await request.get('/new/feed.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/xml/);
  const built = await response.text();

  await page.goto('/new');
  const parsed = await parseInBrowser(page, built);
  expect(parsed.error).toBeNull();
  expect(parsed.root).toBe('rss');
  expect(parsed.version).toBe('2.0');
  expect(parsed.titles).toEqual(NAMES);
  for (const link of parsed.links) expect(link).toMatch(/^https:\/\/tally\.milux\.co\.uk\/companies\/[a-z0-9-]+\/$/);

  // A feed built from hostile names and summaries still parses, with the text intact.
  const raw = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8'));
  const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8'));
  const data = slimData(raw, taxonomy) as TallyData;
  const hostile = data.companies.map((c) =>
    c.name === 'Example Vehicles' ? { ...c, name: 'Smith & Jones <Defence> "Ltd" it\'s', summary: 'A & B <b>bold</b> ]]> <script>x</script>' } : c,
  );
  const xml = feedXml(recentAdditions(hostile, addedFromFixture() as Record<string, string>, data.taxonomy));
  const hostileParsed = await parseInBrowser(page, xml);
  expect(hostileParsed.error).toBeNull();
  expect(hostileParsed.titles[1]).toBe('Smith & Jones <Defence> "Ltd" it\'s');
});
