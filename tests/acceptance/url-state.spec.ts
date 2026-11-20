// Acceptance journeys: every view in the URL. Committed failing before the
// build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { AXE_TAGS, clickMapAt, openFilters, useOfflineMap, waitForMap } from '../support/offline-map';

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

const params = (url: string) => new URL(url).searchParams;

test('a filter is written to the URL and restored from it', async ({ page, context }) => {
  await page.goto('/');
  await waitForMap(page);
  await openFilters(page);
  await page.locator('summary', { hasText: 'Cyber, data and software' }).click();
  await page.getByRole('checkbox', { name: 'Cyber', exact: true }).check();
  await expect.poll(() => params(page.url()).get('cap')).toBe('cyber');

  const fresh = await context.newPage();
  await useOfflineMap(fresh);
  await fresh.goto(page.url());
  await waitForMap(fresh);
  await expect(fresh.locator('#result-count')).toContainText('5 companies');
  await openFilters(fresh);
  await fresh.locator('summary', { hasText: 'Cyber, data and software' }).click();
  await expect(fresh.getByRole('checkbox', { name: 'Cyber', exact: true })).toBeChecked();
  const results = await new AxeBuilder({ page: fresh }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('the map centre and zoom are written to the URL and restored', async ({ page }) => {
  await page.goto('/?map=8/51.5/-2.55');
  await waitForMap(page);
  const view = await page.locator('#tally-map').evaluate((el) => {
    const map = (el as unknown as { tallyMap: { getZoom: () => number; getCenter: () => { lat: number; lng: number } } }).tallyMap;
    return { zoom: map.getZoom(), lat: map.getCenter().lat, lon: map.getCenter().lng };
  });
  expect(view.zoom).toBeCloseTo(8, 1);
  expect(view.lat).toBeCloseTo(51.5, 2);
  expect(view.lon).toBeCloseTo(-2.55, 2);

  await page.locator('#tally-map').evaluate((el) => {
    (el as unknown as { tallyMap: { jumpTo: (o: object) => void } }).tallyMap.jumpTo({ center: [-1.5, 53.8], zoom: 6 });
  });
  await expect.poll(() => params(page.url()).get('map')).toMatch(/^6(\.0+)?\/53\.8\d*\/-1\.5\d*$/);
});

test('a selected hexagon and its companies are restored from the URL', async ({ page, context }) => {
  await page.goto('/');
  await waitForMap(page);
  await clickMapAt(page, -2.548, 51.5001);
  await expect(page.getByRole('region', { name: /companies in this area/i })).toBeVisible();
  await expect.poll(() => params(page.url()).get('cell')).toMatch(/^[0-9a-f]{15}$/);

  const fresh = await context.newPage();
  await useOfflineMap(fresh);
  await fresh.goto(page.url());
  await waitForMap(fresh);
  const area = fresh.getByRole('region', { name: /companies in this area/i });
  await expect(area).toContainText('Example Aerial Systems');
  await expect(area).toContainText('Example Flight Test');
});

test('selected companies and the results page are restored from the URL', async ({ page }) => {
  // Selected companies now narrow the one results list, so the selection and
  // the page of the full list are opened one after the other.
  await page.goto('/?sel=example-robotics,example-subsea');
  await waitForMap(page);
  const area = page.getByRole('region', { name: /companies in this area/i });
  await expect(area).toContainText('Example Robotics');
  await expect(area).toContainText('Example Subsea');
  await expect(area).not.toContainText('Example Avionics');
  // A link with both still opens: the two selected companies show, and the
  // page number falls back to the only page there is.
  await page.goto('/?sel=example-robotics,example-subsea&page=2');
  await waitForMap(page);
  await expect(area).toContainText('Example Robotics');
  await expect(area).toContainText('Example Subsea');
  await expect(area.getByRole('list', { name: 'Results' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Page 2 of')).toHaveCount(0);
  await page.goto('/?page=2');
  await waitForMap(page);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: /previous/i }).click();
  await expect.poll(() => params(page.url()).get('page')).toBeNull();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('a link with unknown values still opens cleanly', async ({ page }) => {
  await page.goto('/?cap=cyber,not-real&map=nonsense&page=99');
  await waitForMap(page);
  await expect(page.locator('#result-count')).toContainText('5 companies');
  await expect(page.getByText('Page 1 of 1')).toHaveCount(0);
});
