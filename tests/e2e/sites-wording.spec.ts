import { expect, test } from '@playwright/test';
import { openFilters, useOfflineMap, waitForMap } from '../support/offline-map';

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('the count names the site radius in overlap mode too', async ({ page }) => {
  await page.goto('/?cap=cyber,data&capmatch=all&site=mod-main-building-whitehall&radius=10');
  await waitForMap(page);
  await expect(page.locator('#result-count')).toHaveText(
    '3 companies with a chosen capability within 10 miles of MOD Main Building, Whitehall, in 1 place where all chosen capabilities overlap.',
  );
  await page.getByLabel('Within').selectOption({ label: '50 miles' });
  await openFilters(page);
  await page.getByRole('radio', { name: 'any of these capabilities' }).check();
  await expect(page.locator('#result-count')).toHaveText('3 companies within 50 miles of MOD Main Building, Whitehall. 3 are on the map.');
});
