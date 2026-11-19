// Acceptance journey: the Ask Tally connect page. Fixture build, axe.
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { AXE_TAGS, useOfflineMap } from '../support/offline-map';

test('ask-tally page explains how to connect', async ({ page }) => {
  await useOfflineMap(page);
  await page.goto('/');
  await page.getByRole('link', { name: /ask tally/i }).first().click();
  await expect(page).toHaveURL(/\/ask-tally\/?$/);

  await expect(page.getByRole('heading', { level: 1 })).toContainText(/ask tally/i);
  await expect(page.getByText('https://tally.milux.co.uk/mcp').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /claude/i }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /other/i }).first()).toBeVisible();
  for (const tool of ['search_companies', 'get_company', 'list_capabilities', 'list_clusters_and_events']) {
    await expect(page.getByText(tool).first()).toBeVisible();
  }

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);

  await page.setViewportSize({ width: 375, height: 800 });
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(sideways).toBe(false);
  const narrow = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(narrow.violations).toEqual([]);
});
