import { expect, test } from '@playwright/test';
import { useOfflineMap, waitForMap } from '../support/offline-map';

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

const growth = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Growth over time' });

test('a month with no update says so, and the note explains group counts', async ({ page }) => {
  await page.goto('/?month=2026-09');
  await waitForMap(page);
  await expect(growth(page)).toContainText('September 2026: 26 companies (no update that month; same as August)');
  await expect(growth(page)).toContainText("Group counts use today's capability list");
});

test('a month not in the history leaves the URL', async ({ page }) => {
  await page.goto('/?month=2025-01&cap=cyber');
  await waitForMap(page);
  await expect(growth(page)).toContainText('November 2026: 32 companies');
  await expect.poll(() => new URL(page.url()).searchParams.get('month')).toBeNull();
  expect(new URL(page.url()).searchParams.get('cap')).toBe('cyber');
});
