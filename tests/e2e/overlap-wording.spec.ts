import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { useOfflineMap, waitForMap } from '../support/offline-map';

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('overlap mode reads clearly, leaves the URL with one capability and is noted in the CSV', async ({ page }) => {
  await page.goto('/?cap=cyber,data&capmatch=all&list=example-cyber-defence');
  await waitForMap(page);
  const count = page.locator('#result-count');
  await expect(count).toHaveText('4 companies with a chosen capability, in 2 places where all chosen capabilities overlap.');
  await expect(count).not.toContainText('0 companies');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /download csv/i }).click()]);
  const lines = readFileSync(await download.path(), 'utf8').split(/\r?\n/).filter(Boolean);
  expect(lines).toHaveLength(3);
  expect(lines[2]).toMatch(/^Note: downloaded in overlap mode.*Cyber; Data,+$/);

  await page.locator('summary', { hasText: 'Cyber, data and software' }).click();
  await page.getByRole('checkbox', { name: 'Data', exact: true }).uncheck();
  await expect.poll(() => new URL(page.url()).searchParams.get('capmatch')).toBeNull();
  await expect(count).toContainText('companies match');
  await page.getByRole('checkbox', { name: 'Data', exact: true }).check();
  await expect(page.getByRole('radio', { name: /any chosen capability/i })).toBeChecked();
});
