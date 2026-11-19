// Acceptance journeys: the explorer split into views. The search, place
// controls and map stay at the top; below the map a nav named "Views" switches
// between Companies (the default), Compare, Clusters and Growth, held in the
// URL as `view`. Fixture build, map tiles stubbed. Committed failing before the
// build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const VIEWS = ['Companies', 'Compare', 'Clusters', 'Growth'] as const;

const params = (url: string) => new URL(url).searchParams;
const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const viewLink = (page: Page, name: string) => views(page).getByRole('link', { name, exact: true });
const current = (page: Page) => views(page).locator('a[aria-current="page"]');
const results = (page: Page) => page.getByRole('list', { name: 'Results' });
const matrix = (page: Page) => page.getByRole('table', { name: /capability matrix/i });
const growth = (page: Page) => page.getByRole('region', { name: 'Growth over time' });
const clusters = (page: Page) => page.getByRole('group', { name: 'Clusters' });
const shortlist = (page: Page) => page.getByRole('region', { name: 'Shortlist' });
const overseas = (page: Page) => page.getByRole('region', { name: 'Overseas companies' });

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** Adds synthetic overseas companies to the fixture, more than one page of them. */
async function withManyOverseas(page: Page, count: number) {
  await page.route('**/data/tally.json', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    for (let i = 1; i <= count; i++) {
      const name = `Example Overseas ${String(i).padStart(2, '0')}`;
      json.companies.push({
        id: name.toLowerCase().replace(/ /g, '-'),
        name,
        website: 'https://example.com',
        linkedin: '',
        hq: 'Norway',
        region: 'Overseas',
        size: 'small',
        headcount: '',
        founded: '',
        tags: ['defence', 'cyber'],
        summary: `${name} is a synthetic overseas company for tests.`,
        lat: null,
        lon: null,
        postcode: '',
        location_source: '',
        country: 'Norway',
      });
    }
    json.count = json.companies.length;
    await route.fulfill({ response, json });
  });
}

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('views are links with one current', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(views(page)).toBeVisible();
  for (const name of VIEWS) {
    await expect(viewLink(page, name)).toBeVisible();
    // Links carry the view in their address, so they can be opened in a new tab or shared.
    if (name !== 'Companies') await expect(viewLink(page, name)).toHaveAttribute('href', new RegExp(`view=${name.toLowerCase()}`));
  }
  await expect(current(page)).toHaveCount(1);
  await expect(current(page)).toHaveText('Companies');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('tablist')).toHaveCount(0);
});

test('a view is held in the URL with the filters', async ({ page }) => {
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  const count = await page.locator('#result-count').innerText();
  await viewLink(page, 'Compare').click();
  await expect.poll(() => params(page.url()).get('view')).toBe('compare');
  expect(params(page.url()).get('cap')).toBe('cyber');
  await expect(viewLink(page, 'Compare')).toHaveAttribute('aria-current', 'page');
  await expect(current(page)).toHaveCount(1);
  await expect(matrix(page)).toBeVisible();
  await expect(results(page)).toBeHidden();
  await expect(page.locator('#result-count')).toHaveText(count);

  // A shared link opens its view.
  await page.goto('/?view=growth&cap=cyber');
  await waitForMap(page);
  await expect(viewLink(page, 'Growth')).toHaveAttribute('aria-current', 'page');
  await expect(growth(page)).toBeVisible();
  await expect(matrix(page)).toBeHidden();
  await expect(results(page)).toBeHidden();
  expect(params(page.url()).get('cap')).toBe('cyber');
});

test('switching moves focus and Back returns', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(results(page)).toBeVisible();
  // The map is kept, never remounted, as the view changes.
  await page.locator('#tally-map').evaluate((el) => ((window as unknown as { keptMap: unknown }).keptMap = (el as unknown as { tallyMap: unknown }).tallyMap));

  await viewLink(page, 'Compare').click();
  await expect(page.getByRole('heading', { name: 'Capability matrix' })).toBeFocused();
  await expect(page).toHaveTitle(/Compare/);
  await expect(matrix(page)).toBeVisible();

  await page.goBack();
  await expect.poll(() => params(page.url()).get('view')).toBeNull();
  await expect(viewLink(page, 'Companies')).toHaveAttribute('aria-current', 'page');
  await expect(results(page)).toBeVisible();
  await expect(matrix(page)).toBeHidden();
  expect(
    await page.locator('#tally-map').evaluate((el) => (el as unknown as { tallyMap: unknown }).tallyMap === (window as unknown as { keptMap: unknown }).keptMap),
  ).toBe(true);
});

test('old links open the matching view', async ({ page }) => {
  // A matrix page or group, with no view: Compare.
  await page.goto('/?mpage=2');
  await waitForMap(page);
  await expect(current(page)).toHaveText('Compare');
  await expect(matrix(page)).toBeVisible();

  await page.goto('/?mgroup=cyber-data-software&cap=cyber');
  await waitForMap(page);
  await expect(current(page)).toHaveText('Compare');
  await expect(matrix(page)).toBeVisible();
  expect(params(page.url()).get('cap')).toBe('cyber');

  // A month, with no view: Growth.
  await page.goto('/?month=2026-09');
  await waitForMap(page);
  await expect(current(page)).toHaveText('Growth');
  await expect(growth(page)).toContainText('September 2026');
  await expect(growth(page)).toBeVisible();

  // Neither: Companies.
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await expect(current(page)).toHaveText('Companies');
  await expect(results(page)).toBeVisible();
  await expect(matrix(page)).toBeHidden();

  // A view named in the link wins over the old parameters.
  await page.goto('/?view=growth&mpage=2');
  await waitForMap(page);
  await expect(current(page)).toHaveText('Growth');
  await expect(growth(page)).toBeVisible();
});

test('the default view is short and overseas is paged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await waitForMap(page);
  await expect(current(page)).toHaveText('Companies');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(4000);

  // With more overseas companies than a page holds, the list is paged.
  await withManyOverseas(page, 25);
  await page.goto('/');
  await waitForMap(page);
  const items = overseas(page).locator('.company');
  await expect(items.first()).toBeVisible();
  expect(await items.count()).toBeLessThanOrEqual(20);
  const pager = overseas(page).getByRole('navigation');
  await expect(pager).toBeVisible();
  await expect(pager).toContainText('Page 1 of 2');
  const first = await items.first().innerText();
  await pager.getByRole('button', { name: /next/i }).click();
  await expect(pager).toContainText('Page 2 of 2');
  expect(await items.count()).toBeLessThanOrEqual(20);
  expect(await items.first().innerText()).not.toBe(first);
});

test('place comes first and the shortlist is in reach', async ({ page }) => {
  await page.goto('/?list=example-subsea,example-cyber-defence');
  await waitForMap(page);
  // The near-a-place control comes before the map in document order.
  const placeFirst = await page.evaluate(() => {
    const near = document.getElementById('near-place');
    const map = document.getElementById('tally-map');
    return Boolean(near && map && near.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(placeFirst).toBe(true);

  // The views bar carries the shortlist and its current count.
  await expect(views(page).getByRole('link', { name: 'Shortlist (2)' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Example Avionics to shortlist' }).click();
  await expect(views(page).getByRole('link', { name: 'Shortlist (3)' })).toBeVisible();
  await views(page).getByRole('link', { name: 'Shortlist (3)' }).click();
  await expect(shortlist(page).getByRole('heading', { name: 'Shortlist (3)' })).toBeFocused();
  await expect(shortlist(page)).toBeInViewport();

  // On a phone, the search comes before the shortlist in tab order.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?list=example-subsea');
  await waitForMap(page);
  let reached = '';
  for (let i = 0; i < 100 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return '';
      if (el.id === 'plain-search') return 'search';
      if (el.closest('.shortlist')) return 'shortlist';
      return '';
    });
  }
  expect(reached).toBe('search');
});

test('every view passes axe and fits 320px', async ({ page }) => {
  const addresses: Record<(typeof VIEWS)[number], string> = {
    Companies: '/',
    Compare: '/?view=compare',
    Clusters: '/?view=clusters&cluster=SCRDSC',
    Growth: '/?view=growth',
  };
  for (const name of VIEWS) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(addresses[name]);
    await waitForMap(page);
    await expect(current(page)).toHaveText(name);
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(addresses[name]);
    await waitForMap(page);
    await expect(current(page)).toHaveText(name);
    for (const view of VIEWS) await expect(viewLink(page, view)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expectNoAxeViolations(page);
  }
  // The clusters view holds the clusters panel.
  await page.goto('/?view=clusters');
  await waitForMap(page);
  await expect(clusters(page)).toBeVisible();
});
