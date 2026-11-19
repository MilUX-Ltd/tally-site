// Acceptance journeys: the capability matrix, linked both ways with the map.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8')) as {
  companies: Array<{ name: string; lat: number | null; lon: number | null }>;
};

const params = (url: string) => new URL(url).searchParams;

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const matrix = (page: Page) => page.getByRole('table', { name: /capability matrix/i });
const rowNames = async (page: Page) => (await matrix(page).locator('tbody th[scope="row"]').allInnerTexts()).map((t) => t.trim()).sort();

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('ticking a matrix column filters companies and redraws the map', async ({ page }) => {
  await page.goto('/?view=compare');
  await waitForMap(page);
  await expect(matrix(page)).toBeVisible();
  await matrix(page).getByRole('checkbox', { name: 'Filter by Cyber', exact: true }).check();
  await expect(page.locator('#result-count')).toContainText('5 companies');
  await expect.poll(() => params(page.url()).get('cap')).toBe('cyber');
  await waitForMap(page);
  expect(await rowNames(page)).toEqual([
    'Example Analytics North',
    'Example Cyber Defence',
    'Example Nordic Defence',
    'Example Secure Comms',
    'Example Signals Intelligence',
  ]);
  // The same filter shows as ticked in the filter panel.
  await page.locator('summary', { hasText: 'Cyber, data and software' }).click();
  await expect(page.getByRole('checkbox', { name: 'Cyber', exact: true })).toBeChecked();

  await page.getByLabel('Capabilities shown').selectOption({ label: 'Cyber, data and software' });
  await expect.poll(() => params(page.url()).get('mgroup')).toBe('cyber-data-software');
  await expect(matrix(page).getByRole('checkbox', { name: 'Filter by Space', exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("using the map's current view narrows the matrix", async ({ page }) => {
  await page.goto('/?map=7.5/51.6/-2.3&view=compare');
  await waitForMap(page);
  await page.getByRole('button', { name: "Use the map's current view" }).click();
  await expect.poll(() => params(page.url()).get('area')).not.toBeNull();
  const [w, s, e, n] = (params(page.url()).get('area') as string).split(',').map(Number);
  const expected = fixture.companies
    .filter((c) => c.lat != null && c.lon != null && c.lon >= w && c.lon <= e && c.lat >= s && c.lat <= n)
    .map((c) => c.name)
    .sort();
  expect(expected.length).toBeGreaterThan(2);
  expect(expected).not.toContain('Example Robotics');
  await expect.poll(() => rowNames(page)).toEqual(expected);
  await expectNoAxeViolations(page);
});

test('drawing a rectangle narrows the matrix', async ({ page }) => {
  await page.goto('/?map=8/51.5/-2.55&view=compare');
  await waitForMap(page);
  await page.getByRole('button', { name: 'Draw an area' }).click();
  const corners = await page.locator('#tally-map').evaluate((el) => {
    const map = (el as unknown as { tallyMap: { project: (p: [number, number]) => { x: number; y: number } } }).tallyMap;
    return [map.project([-2.7, 51.6]), map.project([-2.4, 51.4])];
  });
  const box = await page.locator('#tally-map').boundingBox();
  if (!box) throw new Error('map has no box');
  await page.mouse.move(box.x + corners[0].x, box.y + corners[0].y);
  await page.mouse.down();
  await page.mouse.move(box.x + (corners[0].x + corners[1].x) / 2, box.y + (corners[0].y + corners[1].y) / 2, { steps: 5 });
  await page.mouse.move(box.x + corners[1].x, box.y + corners[1].y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => rowNames(page)).toEqual(['Example Aerial Systems', 'Example Composites', 'Example Flight Test']);
  expect(params(page.url()).get('area')).not.toBeNull();
});

test('the matrix works by keyboard alone', async ({ page }) => {
  await page.goto('/?view=compare');
  await waitForMap(page);
  const first = matrix(page).getByRole('checkbox').first();
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  await expect.poll(() => params(page.url()).get('cap')).not.toBeNull();
  await page.keyboard.press('Space');
  await expect(first).not.toBeChecked();
  await page.keyboard.press('Tab');
  await expect(matrix(page).getByRole('checkbox').nth(1)).toBeFocused();

  await page.getByRole('button', { name: "Use the map's current view" }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('area')).not.toBeNull();
  await page.getByRole('button', { name: /clear the area/i }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('area')).toBeNull();
  await expectNoAxeViolations(page);
});

test('the matrix pages through companies and fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?mpage=2');
  await waitForMap(page);
  const rows = await rowNames(page);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);
});
