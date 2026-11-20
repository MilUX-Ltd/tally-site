// Acceptance tests for the explorer on a phone (Matt, 20 November 2026: "The
// mobile experience is really terrible"). The explorer is an ordinary page
// that scrolls: a solid top bar, the search, a map of fixed height, the view
// switch, then the results in full with no scrolling box inside the page.
// Committed failing before the fix. The builder does not edit this file.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

const topbar = (page: Page) => page.locator('header.topbar');
const box = (page: Page, selector: string) => page.locator(selector).first().boundingBox();
const solid = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((e) => {
    const bg = getComputedStyle(e).backgroundColor;
    return bg !== 'transparent' && !/rgba\(.*, 0\)$/.test(bg);
  });

test('1. the landing page has a solid top bar, a map that does not fill the screen, and reaches the footer', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  expect(await solid(page, 'header.topbar')).toBe(true);
  const map = await box(page, '.map-wrap');
  expect(map!.height).toBeLessThanOrEqual(812 * 0.65);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.site-footer')).toBeInViewport();
  // The top bar stays at the top, over nothing.
  expect((await topbar(page).boundingBox())!.y).toBe(0);
  await expectNoAxeViolations(page);
});

test('2. after a search the results follow the map in the page, with no scrolling box inside', async ({ page }) => {
  await page.goto('/?view=map&q=example');
  await waitForMap(page);
  const search = await box(page, '.search-form');
  const map = await box(page, '.map-wrap');
  const panel = await box(page, '.panel');
  expect(map!.y).toBeGreaterThanOrEqual(search!.y + search!.height - 1);
  expect(panel!.y).toBeGreaterThanOrEqual(map!.y + map!.height - 1);
  const inner = await page.locator('.panel-body').evaluate((e) => e.scrollHeight - e.clientHeight);
  expect(inner).toBeLessThanOrEqual(1);
  expect(await solid(page, '.controls')).toBe(true);
});

test('3. the list view drops the map, and every company on the page is reached by scrolling the page', async ({ page }) => {
  await page.goto('/?view=list');
  await expect(page.locator('.rows > li').first()).toBeVisible();
  await expect(page.locator('.map-wrap')).toBeHidden();
  const rows = page.locator('.rows > li');
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toBeInViewport();
  const inner = await page.locator('.panel-body').evaluate((e) => e.scrollHeight - e.clientHeight);
  expect(inner).toBeLessThanOrEqual(1);
  // The view switch never covers the last company.
  const last = (await rows.last().boundingBox())!;
  const controls = (await box(page, '.controls'))!;
  expect(last.y + last.height <= controls.y + 1 || last.y >= controls.y + controls.height - 1).toBe(true);
  await expectNoAxeViolations(page);
});

test('4. one finger on the map scrolls the page', async ({ page }) => {
  await page.goto('/?view=map&q=example');
  await waitForMap(page);
  expect(await page.locator('.maplibregl-map').evaluate((e) => e.classList.contains('maplibregl-cooperative-gestures') || Boolean(e.querySelector('.maplibregl-cooperative-gesture-screen')))).toBe(true);
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
