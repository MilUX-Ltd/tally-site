// Acceptance tests for the website link check (D-kzifn). Fixture build:
// tests/fixtures/websites.json.
// Committed failing before the build. The builder does not edit this file.
import { expect, test } from '@playwright/test';

const website = (name: string) => new RegExp(`^Website of ${name}$`);

test('1. a dead website has no Website button, in the page and in the data', async ({ page, request }) => {
  await page.goto('/companies/example-depot-services/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Example Depot Services');
  await expect(page.getByRole('link', { name: website('Example Depot Services') })).toHaveCount(0);
  const data = await (await request.get('/data/tally.json')).json();
  expect(data.companies.find((c: { id: string }) => c.id === 'example-depot-services').website).toBe('');
});

test('2. a moved page links to the home page', async ({ page }) => {
  await page.goto('/companies/example-moorland-consulting/');
  await expect(page.getByRole('link', { name: website('Example Moorland Consulting') })).toHaveAttribute('href', 'https://example.com/');
});

test('3. other websites are unchanged', async ({ page }) => {
  await page.goto('/companies/example-range-services/');
  await expect(page.getByRole('link', { name: website('Example Range Services') })).toHaveAttribute('href', 'https://example.com/example-range-services');
});
