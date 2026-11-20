// Acceptance journeys: near-me search. Fixture build; map tiles and
// postcodes.io are stubbed, so nothing leaves the test machine. Committed
// failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, listView, openLayers, useOfflineMap, waitForMap } from '../support/offline-map';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8')) as {
  companies: Array<{ name: string; lat: number | null; lon: number | null; country?: string; location_source?: string; tags: string[] }>;
};
const sites = JSON.parse(readFileSync(new URL('../../public/sites/defence-sites.json', import.meta.url), 'utf8')) as {
  sites: Array<{ id: string; name: string; lat: number; lon: number }>;
};
const abbeyWood = sites.sites.find((s) => s.id === 'de-and-s-abbey-wood-bristol') as { id: string; name: string };

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
const near = (place: { lat: number; lon: number }, radius: number, only: (tags: string[]) => boolean = () => true) =>
  fixture.companies
    .filter((c) => c.lat != null && c.lon != null && !c.country && c.location_source !== 'region' && only(c.tags))
    .filter((c) => miles(place.lat, place.lon, c.lat as number, c.lon as number) <= radius)
    .map((c) => c.name)
    .sort();

const BS16 = { postcode: 'BS16 1QY', lat: 51.5, lon: -2.55 };
const PO1 = { postcode: 'PO1 3LJ', lat: 50.8198, lon: -1.088 };
const NEWPORT = [
  { name_1: 'Newport', local_type: 'Village', latitude: 51.9833, longitude: 0.2167, county_unitary: 'Essex', country: 'England' },
  { name_1: 'Newport', name_2: 'Casnewydd', local_type: 'City', latitude: 51.5877, longitude: -2.9984, county_unitary: 'Newport', country: 'Wales' },
  { name_1: 'Newport', local_type: 'Town', latitude: 50.701, longitude: -1.2883, county_unitary: 'Isle of Wight', country: 'England' },
];

/** Answers postcodes.io locally and records every request made to it. */
async function useOfflineGeocoder(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('https://api.postcodes.io/**', async (route) => {
    const url = new URL(route.request().url());
    asked.push(url.toString());
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    const path = decodeURIComponent(url.pathname).replace(/\s+/g, '').toUpperCase();
    if (path === '/POSTCODES/BS161QY') return json(200, { status: 200, result: { postcode: BS16.postcode, latitude: BS16.lat, longitude: BS16.lon } });
    if (path === '/POSTCODES/PO13LJ') return json(200, { status: 200, result: { postcode: PO1.postcode, latitude: PO1.lat, longitude: PO1.lon } });
    if (url.pathname === '/places' && url.searchParams.get('q')?.toLowerCase() === 'newport') return json(200, { status: 200, result: NEWPORT });
    if (url.pathname === '/places') return json(200, { status: 200, result: [] });
    return json(404, { status: 404, error: 'Not found' });
  });
  return asked;
}

async function findPlace(page: Page, text: string) {
  const box = page.getByLabel('Near', { exact: true });
  await box.focus();
  await box.fill('');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('typing a postcode shows companies near it', async ({ page }) => {
  const asked = await useOfflineGeocoder(page);
  await page.goto('/');
  await waitForMap(page);
  const panel = page.getByRole('search');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('postcodes.io');
  await expectNoAxeViolations(page);

  await findPlace(page, 'bs16 1qy');
  await expect.poll(() => params(page.url()).get('near')).toBe(BS16.postcode);
  expect(params(page.url()).get('at')).toBe('51.5,-2.55');
  expect(asked).toHaveLength(1);
  expect(new URL(asked[0]).origin).toBe('https://api.postcodes.io');

  const distance = page.getByLabel('Within');
  await distance.focus();
  await distance.selectOption({ label: '10 miles' });
  await expect.poll(() => params(page.url()).get('within')).toBe('10');
  const ten = near(BS16, 10);
  await listView(page);
  expect(ten.length).toBeGreaterThan(0);
  await expect(page.locator('#result-count')).toContainText(`${ten.length} compan`);
  await expect(page.locator('#result-count')).toContainText(`within 10 miles of ${BS16.postcode}`);
  await expect.poll(() => rowNames(page)).toEqual(ten);
  const list = page.getByRole('list', { name: 'Results' });
  for (const name of ten) await expect(list).toContainText(name);
  await expect(list).not.toContainText('Example Cyber Defence');
  await expect.poll(() => featureCount(page, 'site-ring')).toBe(1);
  await expectNoAxeViolations(page);

  await distance.selectOption({ label: '50 miles' });
  const fifty = near(BS16, 50);
  expect(fifty.length).toBeGreaterThan(ten.length);
  await expect.poll(() => rowNames(page)).toEqual(fifty);

  // The view reopens from its URL without asking the geocoder again, at phone width.
  const before = asked.length;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?near=${encodeURIComponent(BS16.postcode)}&at=51.5,-2.55&within=5`);
  await waitForMap(page);
  await expect(page.getByLabel('Within')).toHaveValue('5');
  await listView(page);
  await expect(page.locator('#result-count')).toContainText(`within 5 miles of ${BS16.postcode}`);
  await expect.poll(() => rowNames(page)).toEqual(near(BS16, 5));
  expect(asked.length).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: `Remove Within 5 miles of ${BS16.postcode}` }).click();
  await expect.poll(() => params(page.url()).get('near')).toBeNull();
  await expect(page.locator('#result-count')).toContainText('32 companies');
});

test('a town picks the city and an unknown place says so', async ({ page }) => {
  const asked = await useOfflineGeocoder(page);
  await page.goto('/');
  await waitForMap(page);
  await findPlace(page, 'Newport');
  await expect.poll(() => params(page.url()).get('near')).toBe('Newport');
  expect(params(page.url()).get('at')).toBe('51.5877,-2.9984');
  const city = { lat: 51.5877, lon: -2.9984 };
  await expect(page.locator('#result-count')).toContainText('within 25 miles of Newport');
  await listView(page);
  await expect.poll(() => rowNames(page)).toEqual(near(city, 25));

  await findPlace(page, 'Nowhereville');
  await expect(page.getByRole('status')).toContainText('could not find Nowhereville');
  expect(params(page.url()).get('near')).toBe('Newport');
  await expect.poll(() => rowNames(page)).toEqual(near(city, 25));
  await expectNoAxeViolations(page);

  const count = asked.length;
  await findPlace(page, '<script>');
  await expect(page.getByRole('status')).toContainText('postcode');
  expect(asked.length).toBe(count);
  expect(params(page.url()).get('near')).toBe('Newport');
});

test('one location at a time, combined with clusters and overlap', async ({ page }) => {
  await useOfflineGeocoder(page);
  expect(abbeyWood).toBeTruthy();
  await page.goto(`/?site=${abbeyWood.id}&radius=10`);
  await waitForMap(page);
  await openLayers(page);
  await expect(page.getByLabel('Companies near a site')).toHaveValue(abbeyWood.id);

  await findPlace(page, BS16.postcode);
  await expect.poll(() => params(page.url()).get('near')).toBe(BS16.postcode);
  expect(params(page.url()).get('site')).toBeNull();
  await expect(page.getByLabel('Companies near a site')).toHaveValue('');
  await expect(page.locator('#result-count')).toContainText(`within 25 miles of ${BS16.postcode}`);

  await page.getByLabel('Companies near a site').selectOption({ label: abbeyWood.name });
  await expect.poll(() => params(page.url()).get('site')).toBe(abbeyWood.id);
  expect(params(page.url()).get('near')).toBeNull();
  expect(params(page.url()).get('at')).toBeNull();
  await expect(page.locator('#result-count')).toContainText(`of ${abbeyWood.name}`);
  await expect(page.locator('#result-count')).not.toContainText(BS16.postcode);

  // Within a chosen cluster.
  await page.goto(`/?cluster=SCRDSC&near=${encodeURIComponent(PO1.postcode)}&at=50.8198,-1.088&within=10`);
  await waitForMap(page);
  await listView(page);
  const members = near(PO1, 10, (tags) => tags.includes('mbr-scrdsc'));
  expect(members.length).toBeGreaterThan(0);
  await expect(page.locator('#result-count')).toContainText(`in the South Central cluster within 10 miles of ${PO1.postcode}`);
  await expect.poll(() => rowNames(page)).toEqual(members);

  // In overlap mode.
  await page.goto(`/?cap=uas,manufacturing&capmatch=all&near=${encodeURIComponent(BS16.postcode)}&at=51.5,-2.55&within=10`);
  await waitForMap(page);
  await listView(page);
  await expect(page.locator('#result-count')).toContainText(`2 companies with a chosen capability within 10 miles of ${BS16.postcode}, in 1 place`);
  await expect.poll(() => rowNames(page)).toEqual(['Example Aerial Systems', 'Example Composites']);
  await expectNoAxeViolations(page);
});
