// Acceptance journeys: Norway (card 7480). Fixture build; map tiles and
// postcodes.io are stubbed. Norway is in the fixture but not live; these
// journeys switch it on by rewriting the data the page loads, as its flag
// will. Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const params = (url: string) => new URL(url).searchParams;

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const norwegian = (name: string, region: string, town: string, postcode: string, lat: number, lon: number) => ({
  id: name.toLowerCase().replace(/ /g, '-'),
  name,
  website: 'https://example.com',
  linkedin: '',
  hq: `${town}, Norway`,
  region,
  size: 'small',
  headcount: '',
  founded: '',
  tags: ['defence', 'cyber'],
  summary: `${name} is a synthetic Norwegian company for tests.`,
  lat,
  lon,
  postcode,
  location_source: 'register',
  country: 'Norway',
  country_code: 'NO',
});

async function withNorwayLive(page: Page) {
  await page.route('**/data/tally.json', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.countries = json.countries.map((c: { code: string }) => (c.code === 'NO' ? { ...c, live: true } : c));
    json.companies.push(
      norwegian('Example Kongsberg Systems', 'Buskerud', 'Kongsberg', '3616', 59.6689, 9.6502),
      norwegian('Example Trondheim Sonar', 'Trøndelag', 'Trondheim', '7010', 63.4305, 10.3951),
    );
    json.count = json.companies.length;
    await route.fulfill({ response, json });
  });
}

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('with only the UK live there is no scope choice and the page is as before', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(page.getByLabel('Where', { exact: true })).toHaveCount(0);
  await expect(page.locator('#search-hint')).toContainText('postcodes.io');
});

test('with Norway live, Where chooses the country, held in the address', async ({ page }) => {
  await withNorwayLive(page);
  await page.goto('/');
  await waitForMap(page);
  const where = page.getByLabel('Where', { exact: true });
  await expect(where).toBeVisible();
  await expect(where.locator('option')).toHaveText(['United Kingdom', 'Norway', 'Europe']);
  await expect(where).toHaveValue('gb');
  await expectNoAxeViolations(page);

  await where.selectOption({ label: 'Norway' });
  await expect.poll(() => params(page.url()).get('scope')).toBe('no');
  await expect(page.locator('#result-count')).toContainText('3 companies');
  await expect(page.locator('#search-hint')).not.toContainText('postcodes.io');

  // A shared link opens on its scope, with the choice showing it; back to the UK drops it from the address.
  await page.goto('/?scope=europe');
  await waitForMap(page);
  await expect(page.getByLabel('Where', { exact: true })).toHaveValue('europe');
  await page.getByLabel('Where', { exact: true }).selectOption({ label: 'United Kingdom' });
  await expect.poll(() => params(page.url()).has('scope')).toBe(false);
});

test('the scope choice fits a phone', async ({ page }) => {
  await withNorwayLive(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?scope=no');
  await waitForMap(page);
  await expect(page.getByLabel('Where', { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
});
