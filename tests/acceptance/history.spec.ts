// Acceptance journeys: growth over time. Fixture build with a synthetic
// history. Committed failing before the build. Amended for the site redesign:
// growth over time moved from the home page to New companies, so each journey
// opens /new and no longer waits for the map; no assertion is changed.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const params = (url: string) => new URL(url).searchParams;
const growth = (page: Page) => page.getByRole('region', { name: 'Growth over time' });
const groupCount = (page: Page, label: string) =>
  growth(page).getByRole('row', { name: new RegExp(`^${label}`) }).getByRole('cell').first();

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('the growth slider replays the directory by month', async ({ page }) => {
  await page.goto('/new');
  await growth(page).scrollIntoViewIfNeeded();
  await expect(growth(page)).toContainText('November 2026: 57 companies');
  await expect(growth(page)).toContainText('starts in June 2026');
  await expect(groupCount(page, 'Space')).toHaveText('1');
  await expectNoAxeViolations(page);

  const slider = growth(page).getByRole('slider', { name: 'Month' });
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(growth(page)).toContainText('June 2026: 45 companies');
  await expect.poll(() => params(page.url()).get('month')).toBe('2026-06');
  await expect(groupCount(page, 'Space')).toHaveText('0');
  await expect(groupCount(page, 'Domains, platforms and weapons')).toHaveText('11');
  await page.keyboard.press('ArrowRight');
  await expect(growth(page)).toContainText('July 2026: 51 companies');
  await page.keyboard.press('End');
  await expect(growth(page)).toContainText('November 2026: 57 companies');
  await expect.poll(() => params(page.url()).get('month')).toBeNull();

  await growth(page).getByRole('button', { name: 'Play' }).click();
  await expect(growth(page)).toContainText('June 2026: 45 companies');
  await expect(growth(page)).toContainText('November 2026: 57 companies', { timeout: 15_000 });
  await expect(growth(page).getByRole('button', { name: 'Play' })).toBeVisible();
});

test('a month opens from its URL', async ({ page }) => {
  await page.goto('/new?month=2026-09');
  await expect(growth(page)).toContainText('September 2026: 51 companies');
  await page.setViewportSize({ width: 375, height: 812 });
  await growth(page).scrollIntoViewIfNeeded();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);
});
