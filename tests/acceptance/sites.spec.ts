// Acceptance journeys: defence sites overlay and distance rings. Fixture
// build, map tiles stubbed. Committed failing before the build. Not edited
// after that commit.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, matrixView, openLayers, useOfflineMap, waitForMap } from '../support/offline-map';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8')) as {
  companies: Array<{ name: string; lat: number | null; lon: number | null; country?: string }>;
};
const sites = JSON.parse(readFileSync(new URL('../../public/sites/defence-sites.json', import.meta.url), 'utf8')) as {
  sites: Array<{ id: string; name: string; lat: number; lon: number }>;
};

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const params = (url: string) => new URL(url).searchParams;
const matrix = (page: Page) => page.getByRole('table', { name: /compare capabilities/i });
const rowNames = async (page: Page) => (await matrix(page).locator('tbody th[scope="row"]').allInnerTexts()).map((t) => t.trim()).sort();
const featureCount = (page: Page, source: string) =>
  page.locator('#tally-map').evaluate(async (el, id) => {
    const map = (el as unknown as { tallyMap: { getSource: (id: string) => { getData: () => Promise<{ features: unknown[] }> } | undefined } }).tallyMap;
    const src = map.getSource(id);
    return src ? (await src.getData()).features.length : -1;
  }, source);

const miles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.sqrt(h));
};
const near = (site: { lat: number; lon: number }, radius: number) =>
  fixture.companies
    .filter((c) => c.lat != null && c.lon != null && !c.country && miles(site.lat, site.lon, c.lat, c.lon) <= radius)
    .map((c) => c.name)
    .sort();

const abbeyWood = sites.sites.find((s) => s.id === 'de-and-s-abbey-wood-bristol') as { id: string; name: string; lat: number; lon: number };

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('the sites overlay shows every site with attribution', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await openLayers(page);
  const panel = page.getByRole('group', { name: 'Defence sites' });
  await expect(panel).toBeVisible();
  // The attribution moved to About, linked from the panel.
  await expect(panel.getByRole('link', { name: 'Data sources and licences' })).toHaveAttribute('href', '/about#licences');
  const about = await page.context().newPage();
  await about.goto('/about');
  await expect(about.locator('#licences')).toContainText('Wikipedia');
  await expect(about.locator('#licences').getByRole('link', { name: 'CC BY-SA 4.0' })).toBeVisible();
  await about.close();
  const toggle = panel.getByRole('checkbox', { name: 'Show defence sites on the map' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect.poll(() => params(page.url()).get('sites')).toBe('1');
  await expect.poll(() => featureCount(page, 'sites')).toBe(sites.sites.length);
  await expectNoAxeViolations(page);
});

test('picking a site and radius filters the companies', async ({ page }) => {
  expect(abbeyWood).toBeTruthy();
  await page.goto('/');
  await waitForMap(page);
  await openLayers(page);
  await page.getByLabel('Companies near a site').selectOption({ label: abbeyWood.name });
  await page.getByLabel('Within').selectOption({ label: '10 miles' });
  await expect.poll(() => params(page.url()).get('site')).toBe(abbeyWood.id);
  await expect.poll(() => params(page.url()).get('radius')).toBe('10');
  const ten = near(abbeyWood, 10);
  await matrixView(page);
  expect(ten.length).toBeGreaterThan(0);
  await expect(page.locator('#result-count')).toContainText(`${ten.length} compan`);
  await expect(page.locator('#result-count')).toContainText(`within 10 miles of ${abbeyWood.name}`);
  await expect.poll(() => rowNames(page)).toEqual(ten);
  await expect.poll(() => featureCount(page, 'site-ring')).toBe(1);
  await expect(page.getByRole('link', { name: /wikipedia article/i })).toHaveAttribute('href', /^https:\/\/en\.wikipedia\.org\//);
  await expectNoAxeViolations(page);

  await page.getByLabel('Within').selectOption({ label: '50 miles' });
  const fifty = near(abbeyWood, 50);
  expect(fifty.length).toBeGreaterThan(ten.length);
  await expect.poll(() => rowNames(page)).toEqual(fifty);
  await expect.poll(() => params(page.url()).get('radius')).toBe('50');

  // The view opens from its URL, and works at phone width.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?site=${abbeyWood.id}&radius=10`);
  await waitForMap(page);
  await expect(page.getByLabel('Companies near a site')).toHaveValue(abbeyWood.id);
  await matrixView(page);
  await expect.poll(() => rowNames(page)).toEqual(ten);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);

  await openLayers(page);
  await page.getByLabel('Companies near a site').selectOption({ label: 'No site chosen' });
  await expect.poll(() => params(page.url()).get('site')).toBeNull();
  await expect(page.locator('#result-count')).toContainText('32 companies');
});
