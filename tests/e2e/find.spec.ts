// Acceptance tests for the Find page (Tally redesign, slice B): one test per
// criterion in the spec. Fixture build; map tiles, the search route and
// postcodes.io are answered by the test, so nothing leaves the test machine.
// Committed failing before the build.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { getResolution, latLngToCell } from 'h3-js';
import { AXE_TAGS, clickMapAt, useOfflineMap, waitForMap } from '../support/offline-map';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8')) as {
  generated: string;
  companies: Array<{ name: string; lat: number | null; lon: number | null; country?: string; tags: string[] }>;
};
const taxonomy = JSON.parse(readFileSync(new URL('../fixtures/taxonomy.json', import.meta.url), 'utf8')) as {
  facets: { capability: { values: unknown[] } };
};
const sites = JSON.parse(readFileSync(new URL('../../public/sites/defence-sites.json', import.meta.url), 'utf8')) as {
  sites: Array<{ id: string; name: string; lat: number; lon: number }>;
};
const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
const abbeyWood = sites.sites.find((s) => s.id === 'de-and-s-abbey-wood-bristol') as { id: string; name: string; lat: number; lon: number };

const BRISTOL = ['Example Aerial Systems', 'Example Composites', 'Example Flight Test'];
const CYBER = ['Example Analytics North', 'Example Cyber Defence', 'Example Nordic Defence', 'Example Secure Comms', 'Example Signals Intelligence'];
const SOUTH_CENTRAL = ['Example EW Systems', 'Example Harbour Systems', 'Example Human Factors'];
const NEWPORT = { name_1: 'Newport', local_type: 'City', latitude: 51.5877, longitude: -2.9984, county_unitary: 'Newport', country: 'Wales' };

const params = (url: string) => new URL(url).searchParams;
const miles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.sqrt(h));
};
/** UK fixture companies within a radius of a point, nearest first, with whole-mile distances. */
const nearest = (place: { lat: number; lon: number }, radius: number, only: (tags: string[]) => boolean = () => true) =>
  fixture.companies
    .filter((c) => c.lat != null && c.lon != null && !c.country && only(c.tags))
    .map((c) => ({ name: c.name, d: miles(place.lat, place.lon, c.lat as number, c.lon as number) }))
    .filter((c) => c.d <= radius)
    .sort((a, b) => a.d - b.d || a.name.localeCompare(b.name, 'en-GB'));

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
const noSideScroll = async (page: Page, width: number) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

const json = (body: unknown, status = 200) => async (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

/** Answers /api/search with capability filters and records what the page sent. */
async function answerSearch(page: Page, cap: string[]) {
  const sent: unknown[] = [];
  await page.route('**/api/search', async (route) => {
    sent.push(route.request().postDataJSON());
    await json({ fallback: false, filters: { cap, size: [], region: [], fw: [], accr: [], mbr: [] }, capmatch: 'any', site: null, radius: 25 })(route);
  });
  return sent;
}
/** Answers postcodes.io locally: Newport is found, nothing else is. */
async function useOfflineGeocoder(page: Page) {
  const asked: string[] = [];
  await page.route('https://api.postcodes.io/**', async (route) => {
    const url = new URL(route.request().url());
    asked.push(url.toString());
    if (url.pathname === '/places' && url.searchParams.get('q')?.toLowerCase() === 'newport') return json({ status: 200, result: [NEWPORT] })(route);
    if (url.pathname === '/places') return json({ status: 200, result: [] })(route);
    return json({ status: 404, error: 'Not found' }, 404)(route);
  });
  return asked;
}

type TestMap = {
  getPitch: () => number;
  getZoom: () => number;
  getCenter: () => { lat: number; lng: number };
  isMoving: () => boolean;
  jumpTo: (o: object) => void;
  getLayer: (id: string) => { type: string } | undefined;
  getLayoutProperty: (layer: string, name: string) => unknown;
  getPaintProperty: (layer: string, name: string) => unknown;
  getSource: (id: string) => { getData: () => Promise<{ features: Array<{ properties: Record<string, unknown> }> }> } | undefined;
  queryRenderedFeatures: (o: { layers: string[] }) => unknown[];
};
const mapCall = <T>(page: Page, method: keyof TestMap, ...args: unknown[]) =>
  page.locator('#tally-map').evaluate(
    (el, [name, rest]) => {
      const map = (el as unknown as { tallyMap: Record<string, (...a: unknown[]) => unknown> }).tallyMap;
      const value = map[name as string](...(rest as unknown[]));
      // Layers and camera positions are read as plain data.
      return (name === 'getLayer' ? (value as { type?: string } | undefined)?.type : name === 'getCenter' ? { lat: (value as { lat: number }).lat, lng: (value as { lng: number }).lng } : name === 'queryRenderedFeatures' ? (value as unknown[]).length : name === 'jumpTo' ? null : value) as unknown;
    },
    [method, args] as const,
  ) as Promise<T>;
const pitch = (page: Page) => mapCall<number>(page, 'getPitch');
const centre = (page: Page) => mapCall<{ lat: number; lng: number }>(page, 'getCenter');
const featureCount = (page: Page, source: string) =>
  page.locator('#tally-map').evaluate(async (el, id) => {
    const src = (el as unknown as { tallyMap: TestMap }).tallyMap.getSource(id);
    return src ? (await src.getData()).features.length : -1;
  }, source);
const hexProperties = (page: Page) =>
  page.locator('#tally-map').evaluate(async (el) => {
    const src = (el as unknown as { tallyMap: TestMap }).tallyMap.getSource('hexes');
    return src ? (await src.getData()).features.map((f) => f.properties) : [];
  });

const search = (page: Page) => page.getByRole('search');
const what = (page: Page) => page.getByRole('searchbox', { name: 'What do you need?' });
const nearField = (page: Page) => search(page).getByLabel('Near', { exact: true });
const within = (page: Page) => search(page).getByLabel('Within', { exact: true });
const results = (page: Page) => page.getByRole('list', { name: 'Results' });
const resultNames = async (page: Page) => (await results(page).locator('h3').allInnerTexts()).map((t) => t.trim());
const chips = (page: Page) => page.getByRole('list', { name: 'Active filters' });
const shortlist = (page: Page) => page.getByRole('region', { name: 'Shortlist' });
const shortlistButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: /shortlist/i });
const filtersButton = (page: Page) => page.getByRole('button', { name: /^Filters/ });
const filtersPanel = (page: Page) => page.getByRole('dialog', { name: 'Filters' });
const layersPanel = (page: Page) => page.getByRole('dialog', { name: 'Layers' });
const view = (page: Page, name: 'Map' | 'List') => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true });
const style = (page: Page, name: '3D' | 'Flat') => page.getByRole('group', { name: 'Map style' }).getByRole('button', { name, exact: true });
const matrix = (page: Page) => page.getByRole('table', { name: /compare capabilities/i });
const matrixRows = async (page: Page) => (await matrix(page).locator('tbody th[scope="row"]').allInnerTexts()).map((t) => t.trim()).sort();
const fact = (page: Page, label: string) => page.locator('dl.facts div', { hasText: label }).locator('dd');

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('1. Landing: the map fills the window in 3D under the headline, one search form, examples and facts', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const viewport = page.viewportSize() as { width: number; height: number };
  const box = (await page.locator('#tally-map').boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(box.x).toBeLessThanOrEqual(0);
  expect(box.y).toBeLessThanOrEqual(0);
  expect(box.width).toBeGreaterThanOrEqual(viewport.width);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height);
  expect(await pitch(page)).toBeGreaterThan(30);
  expect(await mapCall(page, 'getLayer', 'hex-3d')).toBe('fill-extrusion');

  await expect(page.getByText('Open directory · public sources · free to use')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find UK defence capability.');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Companies, clusters and defence sites on one map. Search by capability and place, shortlist the companies you want and share the list.')).toBeVisible();

  // One search form: What, Near, Within, Search.
  await expect(search(page)).toHaveCount(1);
  await expect(what(page)).toBeVisible();
  await expect(nearField(page)).toBeVisible();
  await expect(within(page)).toBeVisible();
  await expect(search(page).getByRole('button', { name: 'Search', exact: true })).toBeVisible();

  await expect(page.getByRole('group', { name: 'Example searches' }).getByRole('button')).toHaveCount(3);

  // The fact strip comes from the data.
  await expect(fact(page, 'Companies')).toHaveText(fixture.companies.length.toLocaleString('en-GB'));
  await expect(fact(page, 'Capabilities')).toHaveText(String(taxonomy.facets.capability.values.length));
  await expect(fact(page, 'Defence sites')).toHaveText(String(sites.sites.length));
  await expect(fact(page, 'Last updated')).toHaveText(new Date(fixture.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));

  // No results panel until something is asked for.
  await expect(results(page)).toHaveCount(0);
});

test('2. One search: a need and a place set the filters, fly the map, draw the ring and list the nearest first', async ({ page }) => {
  const sent = await answerSearch(page, ['cyber']);
  const asked = await useOfflineGeocoder(page);
  await page.goto('/');
  await waitForMap(page);
  // The hint says an AI model turns the words into filters.
  await expect(search(page)).toContainText(/AI model/);
  await expect(search(page)).toContainText(/filters/);
  const before = await centre(page);

  await what(page).fill('cyber companies');
  await nearField(page).fill('Newport');
  await within(page).selectOption({ label: '50 miles' });
  await search(page).getByRole('button', { name: 'Search', exact: true }).click();

  await expect.poll(() => params(page.url()).get('cap')).toBe('cyber');
  await expect.poll(() => params(page.url()).get('near')).toBe('Newport');
  expect(params(page.url()).get('within')).toBe('50');
  expect(sent).toEqual([{ q: 'cyber companies' }]);
  expect(asked).toHaveLength(1);

  // The ring is drawn and the map has moved to the place.
  await expect.poll(() => featureCount(page, 'site-ring')).toBe(1);
  await waitForMap(page);
  const after = await centre(page);
  expect(Math.abs(after.lat - before.lat) + Math.abs(after.lng - before.lng)).toBeGreaterThan(1);
  expect(miles(after.lat, after.lng, NEWPORT.latitude, NEWPORT.longitude)).toBeLessThan(80);

  // Nearest first, each with its distance.
  const expected = nearest({ lat: NEWPORT.latitude, lon: NEWPORT.longitude }, 50, (tags) => tags.includes('cyber'));
  expect(expected.length).toBeGreaterThan(0);
  await expect.poll(() => resultNames(page)).toEqual(expected.map((c) => c.name));
  const rows = results(page).getByRole('listitem');
  for (let i = 0; i < expected.length; i++) await expect(rows.nth(i)).toContainText(new RegExp(`${Math.round(expected[i].d)} mi`, 'i'));

  // A defence site typed in Near (offered as a type-ahead) works like a place.
  const listId = await nearField(page).getAttribute('list');
  expect(listId).toBeTruthy();
  await expect(page.locator(`datalist#${listId} option[value="${abbeyWood.name}"]`)).toHaveCount(1);
  await what(page).fill('');
  await nearField(page).fill(abbeyWood.name);
  await nearField(page).press('Enter');
  await expect.poll(() => params(page.url()).get('site')).toBe(abbeyWood.id);
  expect(params(page.url()).get('near')).toBeNull();
  expect(asked).toHaveLength(1);
  const nearSite = nearest(abbeyWood, 50, (tags) => tags.includes('cyber'));
  await expect.poll(() => resultNames(page)).toEqual(nearSite.map((c) => c.name));
});

test('3. Results state: the compact search bar, a chip for every filter, Clear all and the results panel', async ({ page }) => {
  await page.goto('/?cap=cyber&accr=accr-ce-plus');
  await waitForMap(page);
  // The hero gives way to the compact bar; the page keeps its heading for assistive technology.
  await expect(page.getByText('Open directory · public sources · free to use')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Example searches' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find UK defence capability.');
  await expect(what(page)).toBeVisible();
  const bar = (await search(page).boundingBox()) as { height: number };
  expect(bar.height).toBeLessThan(140);

  // A chip for every active filter, each with a remove button, and Clear all.
  await expect(chips(page).getByRole('listitem')).toHaveCount(2);
  await expect(chips(page)).toContainText('Cyber');
  await expect(chips(page)).toContainText('Cyber Essentials Plus');
  await expect.poll(() => resultNames(page)).toEqual(['Example Cyber Defence', 'Example Signals Intelligence']);
  await chips(page).getByRole('button', { name: 'Remove Cyber Essentials Plus' }).click();
  await expect.poll(() => params(page.url()).get('accr')).toBeNull();
  await expect.poll(() => resultNames(page)).toEqual(CYBER);

  // Every row has a shortlist button and its name links to the company page.
  const rows = results(page).getByRole('listitem');
  await expect(rows).toHaveCount(CYBER.length);
  for (let i = 0; i < CYBER.length; i++) {
    await expect(rows.nth(i).getByRole('button', { name: `Add ${CYBER[i]} to shortlist` })).toBeVisible();
  }
  await expect(results(page).getByRole('link', { name: 'Example Cyber Defence' })).toHaveAttribute('href', '/companies/example-cyber-defence/');

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect.poll(() => params(page.url()).get('cap')).toBeNull();
  await expect(chips(page)).toHaveCount(0);

  // Twenty to a page.
  await page.goto('/?page=2');
  await waitForMap(page);
  await expect(results(page).getByRole('listitem')).toHaveCount(fixture.companies.length - 20);
  await page.getByRole('navigation', { name: 'Results pages' }).getByRole('button', { name: /previous/i }).click();
  await expect(results(page).getByRole('listitem')).toHaveCount(20);
});

test('4. Old links: every link that worked before opens showing the same companies', async ({ page }) => {
  // Many page loads in one test.
  test.slow();
  const open = async (query: string) => {
    await page.goto(`/?${query}`);
    await waitForMap(page);
  };
  const sorted = async () => (await resultNames(page)).sort();

  await open('cap=cyber');
  await expect.poll(sorted).toEqual(CYBER);

  // A shared shortlist opens on the shortlist.
  await open('list=example-subsea,example-cyber-defence');
  await expect(shortlist(page)).toBeVisible();
  await expect(shortlist(page)).toContainText('Example Subsea');
  await expect(shortlist(page)).toContainText('Example Cyber Defence');

  await open(`near=${encodeURIComponent('BS16 1QY')}&at=51.5,-2.55&within=10`);
  await expect.poll(sorted).toEqual(nearest({ lat: 51.5, lon: -2.55 }, 10).map((c) => c.name).sort());
  await expect(nearField(page)).toHaveValue('BS16 1QY');
  await expect(within(page)).toHaveValue('10');

  await open(`site=${abbeyWood.id}&radius=10`);
  await expect.poll(sorted).toEqual(nearest(abbeyWood, 10).map((c) => c.name).sort());
  await expect(nearField(page)).toHaveValue(abbeyWood.name);

  await open('cluster=SCRDSC');
  await expect.poll(sorted).toEqual(SOUTH_CENTRAL);
  await expect(chips(page)).toContainText('South Central');

  await open('sel=example-robotics,example-subsea');
  await expect.poll(sorted).toEqual(['Example Robotics', 'Example Subsea']);

  await open(`cell=${latLngToCell(51.5001, -2.548, 4)}`);
  await expect.poll(sorted).toEqual(BRISTOL);
  await expect(chips(page)).toContainText('Map area');

  await open('area=-2.7,51.4,-2.4,51.6');
  await expect.poll(sorted).toEqual(BRISTOL);

  // A matrix page opens on the List view, at that page of the matrix.
  await open('mpage=2');
  await expect(view(page, 'List')).toHaveAttribute('aria-pressed', 'true');
  const second = await matrixRows(page);
  expect(second.length).toBe(fixture.companies.length - 25);

  // Growth over time has moved; a month link still opens every company and points to it.
  await open('month=2026-09');
  await expect(page.locator('#result-count')).toContainText(`${fixture.companies.length} companies`);
  const moved = page.getByRole('link', { name: /growth over time/i });
  await expect(moved).toBeVisible();
  await expect(moved).toHaveAttribute('href', /^\/new\/?(\?month=2026-09)?$/);
});

test('5. Filters: the groups open in a side panel that ends Show n companies, with the capability match toggle', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(filtersPanel(page)).toHaveCount(0);
  await filtersButton(page).click();
  const panel = filtersPanel(page);
  await expect(panel).toBeVisible();
  // Focus moves into the panel.
  expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  const show = panel.getByRole('button', { name: /^Show \d+ compan/ });
  await expect(show).toHaveText(`Show ${fixture.companies.length} companies`);

  // The existing groups.
  for (const title of ['Cyber, data and software', 'Size', 'Region', 'Frameworks', 'Accreditations', 'Memberships']) {
    await expect(panel.locator('summary', { hasText: title })).toBeVisible();
  }
  await panel.locator('summary', { hasText: 'Cyber, data and software' }).click();
  await panel.getByRole('checkbox', { name: 'Cyber', exact: true }).check();
  await expect(show).toHaveText('Show 5 companies');
  await expect(panel.getByRole('radio')).toHaveCount(0);
  await panel.getByRole('checkbox', { name: 'Data', exact: true }).check();
  await expect(show).toHaveText('Show 6 companies');

  // The capability match toggle lives in the panel.
  const all = panel.getByRole('radio', { name: 'all of them in the same area' });
  await expect(panel.getByRole('radio', { name: 'any of these capabilities' })).toBeChecked();
  await all.check();
  await expect.poll(() => params(page.url()).get('capmatch')).toBe('all');
  await expect(show).toHaveText('Show 4 companies');

  // Show n companies closes the panel, returns focus and leaves the results.
  await show.click();
  await expect(filtersPanel(page)).toHaveCount(0);
  await expect(filtersButton(page)).toBeFocused();
  await expect(results(page).getByRole('listitem')).toHaveCount(4);
  await expect(chips(page)).toContainText('Cyber');
  await expect(chips(page)).toContainText('Data');

  // Escape closes it too.
  await filtersButton(page).click();
  await expect(filtersPanel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(filtersPanel(page)).toHaveCount(0);
  await expect(filtersButton(page)).toBeFocused();

  // On a phone it is a full-screen sheet.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await filtersButton(page).click();
  const sheet = (await filtersPanel(page).boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(sheet.x).toBeLessThanOrEqual(0);
  expect(sheet.y).toBeLessThanOrEqual(0);
  expect(sheet.width).toBeGreaterThanOrEqual(390);
  expect(sheet.height).toBeGreaterThanOrEqual(844);
  await expect(filtersPanel(page).getByRole('button', { name: 'Show 5 companies' })).toBeVisible();
});

test('6. Map: 3D columns by default, Flat held in the URL, finer hexagons and pins on zooming, Map area chip, Layers and map tools', async ({ page }) => {
  // Many page loads in one test.
  test.slow();
  await page.goto('/');
  await waitForMap(page);
  // 3D by default: extruded columns in the data ramp, scaled to the busiest area in view.
  await expect(style(page, '3D')).toHaveAttribute('aria-pressed', 'true');
  expect(params(page.url()).get('flat')).toBeNull();
  expect(await mapCall(page, 'getLayoutProperty', 'hex-3d', 'visibility')).not.toBe('none');
  const colour = JSON.stringify(await mapCall(page, 'getPaintProperty', 'hex-3d', 'fill-extrusion-color')).toUpperCase();
  for (const stop of ['#F2D9A6', '#EDA552', '#E2611C', '#8A2B0A']) expect(colour).toContain(stop);
  const columns = await hexProperties(page);
  expect(columns.length).toBeGreaterThan(5);
  expect(Math.max(...columns.map((p) => Number(p.t)))).toBe(1);
  expect(Math.max(...columns.map((p) => Number(p.height)))).toBeGreaterThan(0);

  // Flat is held in the URL; 3D is the default and leaves it.
  await style(page, 'Flat').click();
  await expect.poll(() => params(page.url()).get('flat')).toBe('1');
  await expect.poll(() => pitch(page)).toBe(0);
  expect(await mapCall(page, 'getLayoutProperty', 'hex-3d', 'visibility')).toBe('none');
  await page.reload();
  await waitForMap(page);
  await expect(style(page, 'Flat')).toHaveAttribute('aria-pressed', 'true');
  expect(await pitch(page)).toBe(0);
  await style(page, '3D').click();
  await expect.poll(() => params(page.url()).get('flat')).toBeNull();
  await expect.poll(() => pitch(page)).toBeGreaterThan(30);

  // Finer hexagons as you zoom in, and pins at close zoom.
  await waitForMap(page);
  const resolution = async () => getResolution(String((await hexProperties(page))[0].cell));
  const coarse = await resolution();
  await mapCall(page, 'jumpTo', { center: [-1.5, 52.5], zoom: 7.5 });
  await expect.poll(resolution).toBeGreaterThan(coarse);
  await mapCall(page, 'jumpTo', { center: [-2.548, 51.5001], zoom: 10, pitch: 0, bearing: 0 });
  await waitForMap(page);
  await expect.poll(() => mapCall<number>(page, 'queryRenderedFeatures', { layers: ['pins', 'clusters'] })).toBeGreaterThan(0);

  // Selecting a column narrows the list and adds a Map area chip.
  await page.goto('/');
  await waitForMap(page);
  await clickMapAt(page, -2.548, 51.5001);
  await expect.poll(() => params(page.url()).get('cell')).toMatch(/^[0-9a-f]{15}$/);
  await expect(chips(page)).toContainText('Map area');
  await expect.poll(async () => (await resultNames(page)).sort()).toEqual(BRISTOL);
  await chips(page).getByRole('button', { name: /^Remove Map area/ }).click();
  await expect.poll(() => params(page.url()).get('cell')).toBeNull();

  // Layers turns on Clusters (regions and legend) and Defence sites.
  const layers = page.getByRole('button', { name: 'Layers', exact: true });
  await expect(layers).toHaveAttribute('aria-expanded', 'false');
  await layers.click();
  await expect(layers).toHaveAttribute('aria-expanded', 'true');
  await layersPanel(page).getByRole('checkbox', { name: 'Show cluster areas on the map' }).check();
  await expect.poll(() => params(page.url()).get('clusters')).toBe('1');
  await expect.poll(() => featureCount(page, 'cluster-regions')).toBe(16);
  await expect(layersPanel(page).getByRole('list', { name: 'Clusters on the map' }).getByRole('button')).toHaveCount(16);
  await layersPanel(page).getByRole('checkbox', { name: 'Show defence sites on the map' }).check();
  await expect.poll(() => params(page.url()).get('sites')).toBe('1');
  await expect.poll(() => featureCount(page, 'sites')).toBe(sites.sites.length);
  await page.keyboard.press('Escape');
  await expect(layersPanel(page)).toHaveCount(0);
  await expect(layers).toBeFocused();

  // Search this area replaces the old button; Draw an area stays under map tools.
  await expect(page.getByRole('button', { name: "Use the map's current view" })).toHaveCount(0);
  const tools = page.getByRole('group', { name: 'Map tools' });
  await expect(tools.getByRole('button', { name: 'Draw an area' })).toBeVisible();
  await tools.getByRole('button', { name: 'Search this area' }).click();
  await expect.poll(() => params(page.url()).get('area')).not.toBeNull();
  await expect(chips(page)).toContainText('Map area');
});

test('7. List view: the same results full width with no map, the matrix, overseas by country and paging', async ({ page }) => {
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await expect.poll(async () => (await resultNames(page)).sort()).toEqual(CYBER);
  await view(page, 'List').click();
  await expect(view(page, 'List')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => params(page.url()).get('view')).toBe('list');

  // The same results, full width, and the map out of reach.
  expect((await resultNames(page)).sort()).toEqual(CYBER);
  const viewport = page.viewportSize() as { width: number };
  const panel = (await page.getByRole('region', { name: 'Results' }).boundingBox()) as { width: number };
  expect(panel.width).toBeGreaterThan(viewport.width * 0.9);
  await expect(page.locator('.map-wrap')).toHaveAttribute('inert', '');
  await expect(page.getByRole('group', { name: 'Map style' })).toHaveCount(0);

  // The matrix compares the results.
  await expect(page.getByRole('heading', { name: 'Compare capabilities' })).toBeVisible();
  await expect.poll(() => matrixRows(page)).toEqual(CYBER);

  // Overseas companies by country, closed by default.
  const overseas = page.getByRole('region', { name: 'Overseas companies' });
  await expect(overseas.locator('details')).not.toHaveAttribute('open', '');
  await overseas.locator('summary').click();
  await expect(overseas.getByRole('heading', { name: 'Norway' })).toBeVisible();
  await expect(overseas).toContainText('Example Nordic Defence');

  // With the shortlist open, the matrix compares the shortlist.
  await results(page).getByRole('button', { name: 'Add Example Secure Comms to shortlist' }).click();
  await shortlistButton(page).click();
  await expect.poll(() => matrixRows(page)).toEqual(['Example Secure Comms']);
  await shortlistButton(page).click();

  // The view opens from its link, pages, and goes back to the map.
  await page.goto('/?view=list');
  await waitForMap(page);
  await expect(results(page).getByRole('listitem')).toHaveCount(20);
  await page.getByRole('navigation', { name: 'Results pages' }).getByRole('button', { name: /next/i }).click();
  await expect.poll(() => params(page.url()).get('page')).toBe('2');
  await expect(results(page).getByRole('listitem')).toHaveCount(fixture.companies.length - 20);
  await view(page, 'Map').click();
  await expect.poll(() => params(page.url()).get('view')).toBeNull();
  await expect(page.locator('.map-wrap')).not.toHaveAttribute('inert', '');
});

test('8. Shortlist: the top bar counts, the button opens the shortlist in the panel, and a shared link opens on it', async ({ page, context }) => {
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await expect(shortlistButton(page)).toContainText('0');
  await results(page).getByRole('button', { name: 'Add Example Cyber Defence to shortlist' }).click();
  await results(page).getByRole('button', { name: 'Add Example Secure Comms to shortlist' }).click();
  await expect(shortlistButton(page)).toContainText('2');
  await expect.poll(() => params(page.url()).get('list')).toBe('example-cyber-defence,example-secure-comms');
  await expect(shortlist(page)).toHaveCount(0);

  await shortlistButton(page).click();
  await expect(shortlist(page)).toBeVisible();
  await expect(shortlistButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(shortlist(page)).toContainText('Example Cyber Defence');
  await expect(shortlist(page)).toContainText('Example Secure Comms');
  await expect(shortlist(page)).not.toContainText('Example Analytics North');
  await expect(shortlist(page).getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(shortlist(page).getByRole('button', { name: 'Download as a spreadsheet (CSV)' })).toBeVisible();
  const contact = shortlist(page).getByRole('link', { name: 'Talk to MilUX about this shortlist' });
  await expect(contact).toHaveAttribute('href', 'https://milux.co.uk/contact/');
  const shared = await shortlist(page).getByRole('textbox', { name: /link to this shortlist/i }).inputValue();

  // The MilUX contact shows only when the shortlist holds companies.
  await shortlist(page).getByRole('button', { name: 'Remove Example Cyber Defence from shortlist' }).click();
  await shortlist(page).getByRole('button', { name: 'Remove Example Secure Comms from shortlist' }).click();
  await expect(shortlistButton(page)).toContainText('0');
  await expect(shortlist(page)).toContainText('Your shortlist is empty.');
  await expect(page.getByRole('link', { name: 'Talk to MilUX about this shortlist' })).toHaveCount(0);

  // Closing it goes back to the results.
  await shortlistButton(page).click();
  await expect(shortlist(page)).toHaveCount(0);
  await expect.poll(async () => (await resultNames(page)).sort()).toEqual(CYBER);

  // A shared list link opens on the shortlist.
  expect(params(shared).get('list')).toBe('example-cyber-defence,example-secure-comms');
  const fresh = await context.newPage();
  await useOfflineMap(fresh);
  await fresh.goto(shared);
  await waitForMap(fresh);
  await expect(shortlist(fresh)).toBeVisible();
  await expect(shortlistButton(fresh)).toContainText('2');
  expect((await shortlist(fresh).locator('h3').allInnerTexts()).map((t) => t.trim())).toEqual(['Example Cyber Defence', 'Example Secure Comms']);
});

test('9. Phone: hero and search in the flow, then the map on top, results as a bottom sheet and the controls in reach', async ({ page }) => {
  // Many page loads in one test.
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForMap(page);
  // The bar, then the hero and the search in the flow.
  const bar = (await page.getByRole('banner').boundingBox()) as { y: number; height: number };
  const heading = (await page.getByRole('heading', { level: 1 }).boundingBox()) as { y: number; height: number };
  const form = (await search(page).boundingBox()) as { y: number; height: number; x: number; width: number };
  expect(bar.y).toBe(0);
  expect(heading.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(form.y).toBeGreaterThanOrEqual(heading.y + heading.height);
  expect(form.x + form.width).toBeLessThanOrEqual(390);
  expect(await page.locator('.hero').evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed');
  await noSideScroll(page, 390);

  // After a search: the map on top, the results as a bottom sheet.
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  const panel = (await page.getByRole('region', { name: 'Results' }).boundingBox()) as { y: number; height: number; width: number };
  expect(panel.y).toBeGreaterThan(844 * 0.35);
  expect(panel.y + panel.height).toBeGreaterThanOrEqual(843);
  expect(panel.width).toBeGreaterThanOrEqual(390);
  const mapBox = (await page.locator('#tally-map').boundingBox()) as { y: number };
  expect(mapBox.y).toBeLessThan(panel.y);
  await expect(results(page).getByRole('listitem').first()).toBeVisible();

  // Map, List, Filters and Layers within reach of the thumb.
  for (const control of [view(page, 'Map'), view(page, 'List'), filtersButton(page), page.getByRole('button', { name: 'Layers', exact: true })]) {
    await expect(control).toBeVisible();
    const box = (await control.boundingBox()) as { y: number; height: number };
    expect(box.y).toBeGreaterThan(844 - 110);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  await noSideScroll(page, 390);

  // No sideways scroll at 320 in any state.
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/', '/?cap=cyber', '/?cap=cyber&view=list', '/?list=example-subsea']) {
    await page.goto(path);
    await waitForMap(page);
    await noSideScroll(page, 320);
  }
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await filtersButton(page).click();
  await expect(filtersPanel(page)).toBeVisible();
  await noSideScroll(page, 320);
});

test('10. Floors: axe passes in every state, the map is never the only route, the CSP is unchanged and nothing animates under reduced motion', async ({ page }) => {
  // Many page loads in one test.
  test.slow();
  // axe at WCAG 2.2 AA: landing, results, list, filters and shortlist, at desktop and phone width.
  for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    for (const path of ['/', '/?cap=cyber', '/?cap=cyber&view=list', '/?list=example-subsea,example-cyber-defence']) {
      await page.goto(path);
      await waitForMap(page);
      await expectNoAxeViolations(page);
    }
    await page.goto('/?cap=cyber');
    await waitForMap(page);
    await filtersButton(page).click();
    await expect(filtersPanel(page)).toBeVisible();
    await expectNoAxeViolations(page);
  }

  // The CSP is the one in public/_headers, and that has not changed.
  const csp =
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org https://api.postcodes.io; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  expect(headers).toContain(`Content-Security-Policy: ${csp}`);
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('Content Security Policy')) violations.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(csp);
  await waitForMap(page);

  // The map is never the only route: by keyboard alone, find companies in a
  // cluster near a site, in the list, and shortlist one.
  await filtersButton(page).focus();
  await page.keyboard.press('Enter');
  await filtersPanel(page).locator('summary', { hasText: 'Cyber, data and software' }).focus();
  await page.keyboard.press('Enter');
  await filtersPanel(page).getByRole('checkbox', { name: 'Cyber', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await expect(filtersPanel(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Layers', exact: true }).focus();
  await page.keyboard.press('Enter');
  await layersPanel(page).getByLabel('Companies near a site').focus();
  await layersPanel(page).getByLabel('Companies near a site').selectOption({ label: 'MOD Main Building, Whitehall' });
  await page.keyboard.press('Escape');
  await expect.poll(() => params(page.url()).get('site')).toBe('mod-main-building-whitehall');
  await view(page, 'List').focus();
  await page.keyboard.press('Enter');
  const first = results(page).getByRole('listitem').first().getByRole('button', { name: /^Add .* to shortlist$/i });
  await first.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('list')).not.toBeNull();
  expect(violations).toEqual([]);

  // One persistent status region: it is there before and after a change.
  await expect(page.getByRole('status')).toHaveCount(1);
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveCount(1);

  // Nothing animates under reduced motion: the camera jumps and the fade does not ease.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await waitForMap(page);
  const start = await centre(page);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await layersPanel(page).getByLabel('Companies near a site').selectOption({ label: abbeyWood.name });
  await expect.poll(() => featureCount(page, 'site-ring')).toBe(1);
  expect(await mapCall(page, 'isMoving')).toBe(false);
  const end = await centre(page);
  expect(Math.abs(end.lat - start.lat) + Math.abs(end.lng - start.lng)).toBeGreaterThan(0.5);
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('.find *')].map((el) => getComputedStyle(el)).filter((s) => parseFloat(s.transitionDuration) > 0 || parseFloat(s.animationDuration) > 0).length,
  );
  expect(durations).toBe(0);
});
