// Acceptance journeys: capability heatmap. Built against the committed
// fixture; map tiles stubbed. Committed failing before the build. Not edited
// after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { AXE_TAGS, clickMapAt, openFilters, useOfflineMap, waitForMap } from '../support/offline-map';

async function expectNoAxeViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('shows the heatmap with attribution and legend', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('#tally-map')).toBeVisible();
  await expect(page.getByText('OpenStreetMap').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Companies per hexagon' })).toBeVisible();
  await expect(page.locator('#result-count')).toContainText('57 companies');
  await expect(page.locator('#result-count')).toContainText('55 are on the map');
  await expectNoAxeViolations(page);
});

test('a filter redraws the map and the list', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await openFilters(page);
  await page.locator('summary', { hasText: 'Cyber, data and software' }).click();
  await page.getByRole('checkbox', { name: 'Cyber', exact: true }).check();
  await expect(page.locator('#result-count')).toContainText('5 companies');
  await expect(page.locator('#result-count')).toContainText('4 are on the map');
  const results = page.getByRole('list', { name: 'Results' });
  await expect(results).toContainText('Example Cyber Defence');
  await expect(results).not.toContainText('Example Robotics');
  await waitForMap(page);
  await expectNoAxeViolations(page);
});

test('clicking a hexagon lists its companies', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await clickMapAt(page, -2.548, 51.5001);
  const area = page.getByRole('region', { name: /companies in this area/i });
  await expect(area).toBeVisible();
  for (const name of ['Example Aerial Systems', 'Example Composites', 'Example Flight Test']) {
    await expect(area).toContainText(name);
  }
  await expect(area).not.toContainText('Example Robotics');
  await expectNoAxeViolations(page);
  await area.getByRole('button', { name: /clear/i }).click();
  await expect(area).toBeHidden();
});

test('works at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('#tally-map')).toBeVisible();
  await expect(page.getByRole('button', { name: /filters/i })).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: /filters/i }).click();
  await expect(page.locator('summary', { hasText: 'Cyber, data and software' })).toBeVisible();
  await expectNoAxeViolations(page);
});
