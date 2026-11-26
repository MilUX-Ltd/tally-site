// Acceptance journeys: a country-aware explorer (card 7479). Fixture build;
// map tiles and postcodes.io are stubbed. Norway is the fixture country: it
// is in the fixture countries file but not live, and these tests switch it on
// by rewriting the data the page loads, as card 7480 will by turning its flag
// on. Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, listView, matrixView, openFilters, useOfflineMap, waitForMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const params = (url: string) => new URL(url).searchParams;

const norwegian = (name: string, region: string, town: string, tags: string[], lat: number, lon: number) => ({
  id: name.toLowerCase().replace(/ /g, '-'),
  name,
  website: 'https://example.com',
  linkedin: '',
  hq: `${town}, Norway`,
  region,
  size: 'small',
  headcount: '',
  founded: '',
  tags: ['defence', ...tags],
  summary: `${name} is a synthetic Norwegian company for tests.`,
  lat,
  lon,
  postcode: '',
  location_source: 'town',
  country: 'Norway',
  country_code: 'NO',
});

const NORWAY = [
  norwegian('Example Kongsberg Systems', 'Buskerud', 'Kongsberg', ['cyber'], 59.6689, 9.6502),
  norwegian('Example Trondheim Sonar', 'Trøndelag', 'Trondheim', ['sonar'], 63.4305, 10.3951),
  norwegian('Example Raufoss Munitions', 'Innlandet', 'Raufoss', ['munitions'], 60.7258, 10.6128),
];

/** Rewrites the data the page loads: Norway's flag on, and three Norwegian companies with points. */
async function withNorwayLive(page: Page) {
  await page.route('**/data/tally.json', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.countries = json.countries.map((c: { code: string }) => (c.code === 'NO' ? { ...c, live: true } : c));
    json.companies.push(...NORWAY);
    json.count = json.companies.length;
    await route.fulfill({ response, json });
  });
}

/** Records every request to postcodes.io and answers none of them. */
async function watchGeocoder(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('https://api.postcodes.io/**', async (route) => {
    asked.push(route.request().url());
    await route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"status":404}' });
  });
  return asked;
}

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('every existing link opens as before, and the UK scope never shows in the address', async ({ page }) => {
  await page.goto('/?scope=gb&cap=cyber');
  await waitForMap(page);
  await expect.poll(() => params(page.url()).has('scope')).toBe(false);
  expect(params(page.url()).get('cap')).toBe('cyber');
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('#result-count')).toContainText('57 companies');
});

test('a country that is not live falls back to the UK and stays in the overseas list', async ({ page }) => {
  await page.goto('/?scope=no');
  await waitForMap(page);
  await expect.poll(() => params(page.url()).has('scope')).toBe(false);
  await expect(page.locator('#result-count')).toContainText('57 companies');
  await listView(page);
  const overseas = page.getByRole('region', { name: 'Overseas companies' });
  await overseas.locator('summary').click();
  await expect(overseas).toContainText('Norway');
  await expect(overseas).toContainText('Example Nordic Defence');
});

test('with its flag on, a country has its own scope, map, regions and Near-me', async ({ page }) => {
  await withNorwayLive(page);
  const asked = await watchGeocoder(page);

  // The UK view is unchanged: Norwegian companies are counted and listed overseas, never drawn.
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('#result-count')).toContainText('60 companies');
  await expect(page.locator('#result-count')).toContainText('55 are on the map');

  // Norway on its own.
  await page.goto('/?scope=no');
  await waitForMap(page);
  expect(params(page.url()).get('scope')).toBe('no');
  await expect(page.locator('#result-count')).toContainText('4 companies');
  await expect(page.locator('#result-count')).toContainText('3 are on the map');
  // The map is centred on Norway, not the UK. (The centre, not the bounds:
  // the default 3D view is tilted, so its bounds run out to the horizon.)
  const centre = await page.locator('#tally-map').evaluate((el) => {
    const c = (el as unknown as { tallyMap: { getCenter: () => { lng: number; lat: number } } }).tallyMap.getCenter();
    return [c.lng, c.lat];
  });
  expect(centre[0]).toBeGreaterThan(4.5);
  expect(centre[0]).toBeLessThan(31.2);
  expect(centre[1]).toBeGreaterThan(57.9);
  expect(centre[1]).toBeLessThan(71.2);

  await openFilters(page);
  const filters = page.getByRole('dialog', { name: 'Filters' });
  await expect(filters.getByRole('checkbox', { name: 'Trøndelag' })).toBeVisible();
  await expect(filters.getByRole('checkbox', { name: 'London' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await filters.getByRole('checkbox', { name: 'Trøndelag' }).check();
  await expect.poll(() => params(page.url()).get('region')).toBe('Trøndelag');
  await filters.getByRole('button', { name: /^Show / }).click();
  await expect(page.locator('#result-count')).toContainText('1 company');

  // Near-me in Norway is answered from Tally's own data, with no request to postcodes.io.
  await page.goto('/?scope=no');
  await waitForMap(page);
  const box = page.getByLabel('Near', { exact: true });
  await box.fill('Kongsberg');
  await box.press('Enter');
  await expect.poll(() => params(page.url()).get('near')).toBe('Kongsberg');
  expect(params(page.url()).get('at')).toBe('59.6689,9.6502');
  expect(asked).toEqual([]);
  await expect(page.locator('#result-count')).toContainText('within 25 miles of Kongsberg');
  await expectNoAxeViolations(page);

  // No overseas section in a single-country scope other than the UK.
  await listView(page);
  await expect(page.getByRole('region', { name: 'Overseas companies' })).toHaveCount(0);
});

test('across several countries the region filter becomes a country filter and the matrix shows the country', async ({ page }) => {
  await withNorwayLive(page);
  await page.goto('/?scope=europe');
  await waitForMap(page);
  // Every company in a live European country is counted (56 UK, 4 Norway); the UK's 55 placed companies and Norway's three are drawn.
  await expect(page.locator('#result-count')).toContainText('60 companies');
  await expect(page.locator('#result-count')).toContainText('58 are on the map');

  await openFilters(page);
  const filters = page.getByRole('dialog', { name: 'Filters' });
  await expect(filters.getByRole('group', { name: 'Country' })).toBeVisible();
  await expect(filters.getByRole('checkbox', { name: 'London' })).toHaveCount(0);
  await filters.getByRole('checkbox', { name: 'Norway' }).check();
  await expect.poll(() => params(page.url()).get('country')).toBe('no');
  await filters.getByRole('button', { name: /^Show / }).click();
  await expect(page.locator('#result-count')).toContainText('4 companies');

  await matrixView(page);
  const matrix = page.getByRole('table', { name: /compare capabilities/i });
  await expect(matrix.getByRole('columnheader', { name: 'Country' })).toBeVisible();
  await expect(matrix.getByRole('row', { name: /Example Kongsberg Systems/ })).toContainText('Norway');
  await expectNoAxeViolations(page);

  // In the UK scope the matrix has no country column, as today.
  await page.goto('/?view=matrix');
  // Wait for the table, so the check is not made before the data has loaded.
  await expect(page.getByRole('table', { name: /compare capabilities/i })).toBeVisible();
  await expect(page.getByRole('table', { name: /compare capabilities/i }).getByRole('columnheader', { name: 'Country' })).toHaveCount(0);
});

test('the sitemap and feeds never carry a Russia path', async ({ request }) => {
  for (const path of ['/sitemap.xml', '/new/feed.xml']) {
    const response = await request.get(path);
    if (response.status() === 404) continue;
    expect(await response.text()).not.toMatch(/\/russia\//i);
  }
  expect((await request.get('/russia/')).status()).toBe(404);
});
