import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { useOfflineMap, waitForMap } from '../support/offline-map';

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('home page shows Tally and the built-with-AI line', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Tally' })).toBeVisible();
  await expect(page.getByText('This was built with AI.').first()).toBeVisible();
});

test('home page meets WCAG 2.2 AA (automated checks)', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('unknown pages return the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});
