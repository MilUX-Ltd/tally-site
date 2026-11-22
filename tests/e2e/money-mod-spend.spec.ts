// Acceptance tests for MOD's official spend with industry by region in the
// Money view (card 7475, D-tnpb9). Fixture build (tests/fixtures/mod-spend.json);
// map tiles are answered by the test. Committed failing before the build.
// The builder does not edit this file.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const params = (url: string) => new URL(url).searchParams;
const panel = (page: Page) => page.getByRole('region', { name: 'Defence contract money', exact: true });
const measure = (page: Page) => page.getByRole('radiogroup', { name: 'Measure' });
const fyears = (page: Page) => page.getByRole('radiogroup', { name: 'Financial year' });
const spendTable = (page: Page) => page.getByRole('table', { name: /MOD spend with UK industry by region/i });

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('1. the Money view opens on contract awards, with the official total for scale', async ({ page }) => {
  await page.goto('/?view=money');
  await waitForMap(page);
  await expect(measure(page).getByRole('radio', { name: 'Contract awards' })).toBeChecked();
  await expect(panel(page)).toContainText('For scale: MOD spent £34.1bn with UK industry in 2025/26 (official statistics).');
  expect(params(page.url()).get('mmeasure')).toBeNull();
});

test('2. MOD spend is a measure held in the address, with the financial year', async ({ page }) => {
  await page.goto('/?view=money');
  await waitForMap(page);
  await measure(page).getByRole('radio', { name: 'MOD spend with industry' }).check();
  await expect.poll(() => params(page.url()).get('mmeasure')).toBe('spend');
  await expect(fyears(page).getByRole('radio', { name: '2025/26' })).toBeChecked();
  await expect(fyears(page).getByRole('radio')).toHaveCount(5);
  await expect(panel(page)).toContainText('£34.1bn');

  await fyears(page).getByRole('radio', { name: '2024/25' }).check();
  await expect.poll(() => params(page.url()).get('mfy')).toBe('2024-25');

  // A shared link opens on its year; a year not in the data falls back to the latest.
  await page.goto('/?view=money&mmeasure=spend&mfy=2024-25');
  await waitForMap(page);
  await expect(fyears(page).getByRole('radio', { name: '2024/25' })).toBeChecked();
  await expect(spendTable(page).locator('tbody tr').nth(0)).toContainText('London');
  await page.goto('/?view=money&mmeasure=spend&mfy=1999-00');
  await waitForMap(page);
  await expect(fyears(page).getByRole('radio', { name: '2025/26' })).toBeChecked();
  // Back to awards drops the spend settings from the address.
  await measure(page).getByRole('radio', { name: 'Contract awards' }).check();
  await expect.poll(() => params(page.url()).get('mmeasure')).toBeNull();
});

test('3. regions are listed by spend with spend per person, and no overseas lines', async ({ page }) => {
  await page.goto('/?view=money&mmeasure=spend');
  await waitForMap(page);
  const rows = spendTable(page).locator('tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(rows.nth(0)).toContainText('South East');
  await expect(rows.nth(0)).toContainText('£8.5bn');
  await expect(rows.nth(0)).toContainText('£870');
  await expect(rows.nth(1)).toContainText('South West');
  await expect(rows.nth(11)).toContainText('North East');
  await expect(page.getByRole('table', { name: /contract money to overseas suppliers/i })).toHaveCount(0);
  // The regional figures are UK only: no overseas lines and no control to show them.
  await expect(panel(page).getByRole('button', { name: 'See overseas' })).toHaveCount(0);
});

test('4. the page says where the official figures come from and what they leave out', async ({ page }) => {
  await page.goto('/?view=money&mmeasure=spend');
  await waitForMap(page);
  const about = panel(page);
  await expect(about).toContainText('Ministry of Defence');
  await expect(about).toContainText('Open Government Licence v3.0');
  await expect(about.getByRole('link', { name: /MOD regional expenditure with industry/i })).toHaveAttribute(
    'href',
    'https://www.gov.uk/government/statistics/mod-regional-expenditure-statistics-with-industry-202526',
  );
  await expect(about).toContainText(/where the work is done/i);
  await expect(about).toContainText(/sub-contract/i);
  await expect(about).toContainText(/Foreign Military Sales/);
  await expect(about).toContainText('2020/21');
  await expect(about).toContainText(/whole value/i);
});

test('5. floors: axe passes and 320px fits', async ({ page }) => {
  await page.goto('/?view=money&mmeasure=spend');
  await waitForMap(page);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/?view=money&mmeasure=spend');
  await waitForMap(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
