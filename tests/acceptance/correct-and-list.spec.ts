// Acceptance journeys: correct this listing, get listed, and the About page.
// Fixture build. Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function subjectOf(link: Locator) {
  const href = (await link.getAttribute('href')) ?? '';
  expect(href.startsWith('mailto:contact@milux.co.uk?')).toBe(true);
  return new URLSearchParams(href.slice(href.indexOf('?') + 1)).get('subject');
}

test('company page offers a correction link', async ({ page }) => {
  await page.goto('/companies/example-cyber-defence/');
  const link = page.getByRole('link', { name: 'Correct this listing' });
  await expect(link).toBeVisible();
  expect(await subjectOf(link)).toBe('Tally correction: Example Cyber Defence');
  await expect(page.locator('form')).toHaveCount(0);
});

test('get listed is site-wide', async ({ page }) => {
  await useOfflineMap(page);
  for (const path of ['/', '/events', '/about', '/companies/example-cyber-defence/']) {
    await page.goto(path);
    const link = page.locator('footer.site-footer').getByRole('link', { name: 'Get listed' });
    await expect(link, path).toBeVisible();
    expect(await subjectOf(link)).toBe('Tally: please list my company');
    await expect(page.locator('footer.site-footer').getByRole('link', { name: 'About', exact: true })).toHaveAttribute('href', '/about');
  }
  await page.goto('/');
  await waitForMap(page);
  const inExplorer = page.locator('header.site-header').getByRole('link', { name: /get listed/i });
  await expect(inExplorer).toBeVisible();
  expect(await subjectOf(inExplorer)).toBe('Tally: please list my company');
});

test('about page explains tally', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/about tally/i);
  const main = page.locator('main');
  for (const text of [/public sources/i, /CC BY 4\.0/, /CC BY-NC 4\.0/, /built with AI/i, /get listed/i, /correct/i]) await expect(main).toContainText(text);
  expect(await subjectOf(main.getByRole('link', { name: /get listed/i }).first())).toBe('Tally: please list my company');
  await expect(page.locator('script')).toHaveCount(0);
  await expect(page.locator('form')).toHaveCount(0);
});

test('about page is accessible at desktop and phone width', async ({ page }) => {
  await page.goto('/about');
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/about');
  await expectNoAxeViolations(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
