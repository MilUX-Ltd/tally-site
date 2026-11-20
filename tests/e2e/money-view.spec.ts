// Acceptance tests for the Money view (D-2bq63, D-2ejsj): where UK defence
// contract money goes, as an overlay on the map. Fixture build
// (tests/fixtures/money.json); map tiles are answered by the test.
// Committed failing before the build. The builder does not edit this file.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const params = (url: string) => new URL(url).searchParams;
const view = (page: Page, name: 'Map' | 'List' | 'Matrix' | 'Money') =>
  page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true });
const panel = (page: Page) => page.getByRole('region', { name: 'Defence contract money', exact: true });
const years = (page: Page) => page.getByRole('radiogroup', { name: 'Year' });
const regionTable = (page: Page) => page.getByRole('table', { name: /contract money by region/i });
const overseasTable = (page: Page) => page.getByRole('table', { name: /contract money to overseas suppliers/i });
const winners = (page: Page) => page.getByRole('list', { name: 'Tally companies winning contracts' });
const capabilityTable = (page: Page) => page.getByRole('table', { name: /by capability/i });

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('1. Money is a view that keeps the map and opens on the latest full year', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await view(page, 'Money').click();
  await expect(view(page, 'Money')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => params(page.url()).get('view')).toBe('money');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Defence contract money', exact: true })).toBeFocused();
  // The map stays in reach: this view is an overlay on it.
  await expect(page.locator('.map-wrap')).not.toHaveAttribute('inert', '');
  // The data runs to 15 November 2026, so 2025 is the latest full year.
  await expect(years(page).getByRole('radio', { name: '2025' })).toBeChecked();
  await expect(panel(page)).toContainText('£17.8m');
  await expect(panel(page)).toContainText('£20.6m');
  await expect(panel(page)).toContainText('£100k');
  // Back to the map drops the view from the address.
  await view(page, 'Map').click();
  await expect.poll(() => params(page.url()).get('view')).toBeNull();
  await expect(panel(page)).toHaveCount(0);
});

test('2. regions are listed by value, and the year is held in the address', async ({ page }) => {
  await page.goto('/?view=money');
  await waitForMap(page);
  const rows = regionTable(page).locator('tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(rows.nth(0)).toContainText('South East');
  await expect(rows.nth(0)).toContainText('£12m');
  await expect(rows.nth(1)).toContainText('London');
  await expect(rows.nth(1)).toContainText('£5m');
  await expect(rows.nth(2)).toContainText('Scotland');
  await expect(rows.nth(2)).toContainText('£800k');

  await years(page).getByRole('radio', { name: '2024' }).check();
  await expect.poll(() => params(page.url()).get('myear')).toBe('2024');
  await expect(rows.nth(0)).toContainText('London');
  await expect(rows.nth(0)).toContainText('£1m');

  await page.goto('/?view=money&myear=2026');
  await waitForMap(page);
  await expect(years(page).getByRole('radio', { name: '2026' })).toBeChecked();
  await expect(regionTable(page).locator('tbody tr').nth(0)).toContainText('South West');
  // A year the data does not hold falls back to the latest full year.
  await page.goto('/?view=money&myear=1999');
  await waitForMap(page);
  await expect(years(page).getByRole('radio', { name: '2025' })).toBeChecked();
});

test('3. money to overseas suppliers is listed by country', async ({ page }) => {
  await page.goto('/?view=money&myear=2025');
  await waitForMap(page);
  const rows = overseasTable(page).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('United States');
  await expect(rows.nth(0)).toContainText('£20m');
  await expect(rows.nth(1)).toContainText('Norway');
  await expect(rows.nth(1)).toContainText('£600k');
});

test('4. the Tally companies winning contracts, and money by capability', async ({ page }) => {
  await page.goto('/?view=money&myear=2025');
  await waitForMap(page);
  const items = winners(page).getByRole('listitem');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText('Example EW Systems');
  await expect(items.nth(0)).toContainText('£4m');
  await expect(items.nth(0).getByRole('link', { name: 'Example EW Systems' })).toHaveAttribute('href', '/companies/example-ew-systems/');
  await expect(items.nth(3)).toContainText('Example Nordic Defence');
  // Suppliers outside Tally are never in this list.
  await expect(winners(page)).not.toContainText('Prime Aerospace');

  const cyber = capabilityTable(page).getByRole('row').filter({ hasText: /^\s*Cyber\b/ });
  await expect(cyber).toContainText('£2.6m');
  const maritime = capabilityTable(page).getByRole('row').filter({ hasText: /^\s*Maritime\b/ });
  await expect(maritime).toContainText('£1.4m');
});

test('5. the page says where the figures come from and what they leave out', async ({ page }) => {
  await page.goto('/?view=money');
  await waitForMap(page);
  await expect(panel(page)).toContainText('Contains public sector information licensed under the Open Government Licence v3.0.');
  await expect(panel(page)).toContainText(/Contracts Finder/);
  await expect(panel(page)).toContainText(/Find a Tender/);
  await expect(panel(page)).toContainText(/whole.contract value/i);
  await expect(panel(page)).toContainText(/framework/i);
  await expect(panel(page)).toContainText(/Foreign Military Sales/);
});

test('6. a company page lists the defence contracts it has won', async ({ page }) => {
  await page.goto('/companies/example-cyber-defence/');
  const section = page.getByRole('region', { name: 'Defence contracts', exact: true });
  await expect(section.getByRole('listitem')).toHaveCount(2);
  await expect(section).toContainText('£2m');
  await expect(section).toContainText('Defence Digital');
  await expect(section.getByRole('link', { name: /Example penetration testing service/ })).toHaveAttribute(
    'href',
    'https://www.contractsfinder.service.gov.uk/Notice/example-2',
  );
  await page.goto('/companies/example-avionics/');
  await expect(page.getByRole('region', { name: 'Defence contracts', exact: true })).toHaveCount(0);
});

test('7. floors: axe passes, 320px fits, the content security policy is unchanged', async ({ page, request }) => {
  await page.goto('/?view=money');
  await waitForMap(page);
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?view=money');
  await waitForMap(page);
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  // The money data ships with the site; no new outside host.
  const money = await request.get('/data/money.json');
  expect(money.status()).toBe(200);
});

test('8. the share to small and medium-sized firms', async ({ page }) => {
  // Added for D-96j1u. 2025 in the fixture: South East £4m SME and £8m large;
  // London £1m SME, £3m large and £1m not known; Scotland's £800k has no size.
  await page.goto('/?view=money&myear=2025');
  await expect(panel(page).getByText(/Small and medium-sized firms won 31% \(£5m\) of UK regional contract money where the supplier’s size is known\./)).toBeVisible();
  await expect(panel(page).getByText(/Size is not known for £1\.8m\./)).toBeVisible();
  await expect(regionTable(page).getByRole('columnheader', { name: 'Share to SMEs' })).toBeVisible();
  await expect(regionTable(page).getByRole('row', { name: /^South East/ })).toContainText('33%');
  await expect(regionTable(page).getByRole('row', { name: /^London/ })).toContainText('25%');
  await expect(regionTable(page).getByRole('row', { name: /^Scotland/ })).toContainText('not known');
  await expect(panel(page)).toContainText(/size is as the supplier declared it/i);
  await expect(panel(page)).toContainText(/SME means a small or medium-sized firm/i);
  // A year with no sizes says nothing about SMEs.
  await page.goto('/?view=money&myear=2024');
  await expect(panel(page)).toContainText('£1m');
  await expect(panel(page)).not.toContainText('Small and medium-sized firms won');
});
