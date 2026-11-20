// Acceptance journeys: capability overlap. Fixture build, map tiles stubbed.
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, closeFilters, listView, matrixView, openFilters, useOfflineMap, waitForMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const params = (url: string) => new URL(url).searchParams;
const matrix = (page: Page) => page.getByRole('table', { name: /compare capabilities/i });
const rowNames = async (page: Page) => (await matrix(page).locator('tbody th[scope="row"]').allInnerTexts()).map((t) => t.trim()).sort();
const hexCount = (page: Page) =>
  page.locator('#tally-map').evaluate(async (el) => {
    const map = (el as unknown as { tallyMap: { getSource: (id: string) => { getData: () => Promise<{ features: unknown[] }> } } }).tallyMap;
    return (await map.getSource('hexes').getData()).features.length;
  });
const OVERLAP = ['Example Analytics North', 'Example Cyber Defence', 'Example Data Labs', 'Example Secure Comms'];

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('overlap toggle narrows the map, matrix and list', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await openFilters(page);
  await page.locator('summary', { hasText: 'Cyber, data and software' }).click();
  await page.getByRole('checkbox', { name: 'Cyber', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'all of them in the same area' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Data', exact: true }).check();
  await expect(page.locator('#result-count')).toContainText('6 companies');
  const any = page.getByRole('radio', { name: 'any of these capabilities' });
  const all = page.getByRole('radio', { name: 'all of them in the same area' });
  await expect(any).toBeChecked();
  await expectNoAxeViolations(page);

  await all.check();
  await expect.poll(() => params(page.url()).get('capmatch')).toBe('all');
  await expect(page.locator('#result-count')).toContainText('4 companies');
  await expect(page.locator('#result-count')).toContainText('2 places');
  await waitForMap(page);
  await expect.poll(() => hexCount(page)).toBe(2);
  await expect(page.getByRole('heading', { name: /places where all chosen capabilities overlap/i })).toBeVisible();
  await closeFilters(page);
  await matrixView(page);
  await expect.poll(() => rowNames(page)).toEqual(OVERLAP);
  await listView(page);
  const results = page.getByRole('list', { name: 'Results' });
  await expect(results.locator('h3')).toHaveCount(4);
  await expect(results).not.toContainText('Example Signals Intelligence');
  await expectNoAxeViolations(page);

  await openFilters(page);
  await any.check();
  await expect.poll(() => params(page.url()).get('capmatch')).toBeNull();
  await expect(page.locator('#result-count')).toContainText('6 companies');
});

test('an overlap view opens from its URL and works by keyboard', async ({ page }) => {
  await page.goto('/?cap=cyber,data&capmatch=all&view=matrix');
  await waitForMap(page);
  await openFilters(page);
  const all = page.getByRole('radio', { name: 'all of them in the same area' });
  await expect(all).toBeChecked();
  await expect(page.locator('#result-count')).toContainText('4 companies');
  await expect.poll(() => rowNames(page)).toEqual(OVERLAP);
  await all.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('radio', { name: 'any of these capabilities' })).toBeChecked();
  await expect.poll(() => params(page.url()).get('capmatch')).toBeNull();
  await expect(page.locator('#result-count')).toContainText('6 companies');
  await page.keyboard.press('ArrowDown');
  await expect(all).toBeChecked();
  await expect.poll(() => params(page.url()).get('capmatch')).toBe('all');
  await page.setViewportSize({ width: 375, height: 812 });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);
});
