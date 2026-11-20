import { expect, test } from '@playwright/test';
import { useOfflineMap } from '../support/offline-map';

// Amended for the site redesign: growth over time moved from the home page to
// New companies, so each journey opens /new and no longer waits for the map.

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

const growth = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Growth over time' });

test('a month with no update says so, and the note explains group counts', async ({ page }) => {
  await page.goto('/new?month=2026-09');
  await expect(growth(page)).toContainText('September 2026: 51 companies (no update that month; same as August)');
  await expect(growth(page)).toContainText("Group counts use today's capability list");
});

test('a month not in the history leaves the URL', async ({ page }) => {
  await page.goto('/new?month=2025-01&cap=cyber');
  await expect(growth(page)).toContainText('November 2026: 57 companies');
  await expect.poll(() => new URL(page.url()).searchParams.get('month')).toBeNull();
  expect(new URL(page.url()).searchParams.get('cap')).toBe('cyber');
});
