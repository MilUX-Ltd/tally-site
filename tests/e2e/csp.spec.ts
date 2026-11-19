import { expect, test } from '@playwright/test';
import { useOfflineMap, waitForMap } from '../support/offline-map';

// The preview server sends the production CSP (astro.config.mjs), so any
// inline script or style would be blocked and reported here.
test('the explorer runs under the CSP with no violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('Content Security Policy')) violations.push(m.text());
  });
  await useOfflineMap(page);
  await page.goto('/');
  await waitForMap(page);
  expect(violations).toEqual([]);
});
