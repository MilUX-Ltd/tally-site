// Acceptance tests for closed companies and the formed and dissolved trend
// (D-iyz0k). Fixture build: tests/fixtures/companies-house.json, with the
// closed company from tests/fixtures/tally-data-closed.json.
// Committed failing before the build. The builder does not edit this file.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test('1. a closed company leaves the directory, the feed and the sitemap', async ({ request }) => {
  const data = await (await request.get('/data/tally.json')).json();
  expect(data.count).toBe(57);
  expect(data.companies.map((c: { name: string }) => c.name)).not.toContain('Example Closed Engineering');
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('example-closed-engineering');
});

test('2. a closed company keeps its page, says it has closed, and is not indexed', async ({ page }) => {
  const response = await page.goto('/companies/example-closed-engineering/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Example Closed Engineering');
  await expect(page.locator('.company-closed')).toHaveText('Companies House lists this company as dissolved on 14 May 2024.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: /to shortlist/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Website/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Show on the Tally map' })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('3. a company in an insolvency process stays listed with a note', async ({ page, request }) => {
  const data = await (await request.get('/data/tally.json')).json();
  expect(data.companies.map((c: { name: string }) => c.name)).toContain('Example Munitions');
  await page.goto('/companies/example-munitions/');
  await expect(page.locator('.company-flagged')).toHaveText('Companies House: in liquidation.');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /to shortlist/ })).toHaveCount(1);
  // An open company carries neither note.
  await page.goto('/companies/example-avionics/');
  await expect(page.locator('.company-closed, .company-flagged')).toHaveCount(0);
});

test('4. the New companies page shows defence companies formed and dissolved each year', async ({ page }) => {
  await page.goto('/new/');
  const section = page.getByRole('region', { name: 'Defence companies formed and closed' });
  await expect(section).toBeVisible();
  await expect(section.getByRole('img', { name: /Defence companies formed and dissolved each year, 2024 to 2026/ })).toBeVisible();
  const table = section.getByRole('table', { name: /formed and dissolved each year/i });
  await expect(table.getByRole('row')).toHaveCount(4);
  const row2024 = table.getByRole('row', { name: /^2024/ });
  await expect(row2024).toContainText('151');
  await expect(row2024).toContainText('98');
  await expect(table.getByRole('row', { name: /2026 to 19 November/ })).toBeVisible();
  await expect(section).toContainText('Manufacture of weapons and ammunition');
  await expect(section).toContainText('Companies House');
  await expect(section).toContainText('Open Government Licence v3.0');
  await expectNoAxeViolations(page);
});
