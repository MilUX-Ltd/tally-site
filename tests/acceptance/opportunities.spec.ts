// Acceptance journeys: funding calls and opportunities. Fixture build.
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

const titles = async (page: Page) => (await page.locator('.opportunity:visible h3').allInnerTexts()).map((t) => t.trim());

test('lists opportunities by deadline with their links', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('Content Security Policy')) violations.push(m.text());
  });
  await page.goto('/opportunities');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Funding calls and opportunities');
  expect(await titles(page)).toEqual([
    'Fixture AI deployment fund',
    'Fixture request for information',
    'Fixture security reviews',
    'Fixture rolling supplier list',
  ]);
  await expect(page.getByText('Fixture closed grant')).toHaveCount(0);
  const ai = page.locator('.opportunity', { hasText: 'Fixture AI deployment fund' });
  await expect(ai).toContainText('Funding call');
  await expect(ai).toContainText('London');
  await expect(ai).toContainText('12 March 2099');
  await expect(ai).toContainText('12:00');
  await expect(ai).toContainText('Funding for SMEs deploying AI with a larger partner.');
  const link = ai.getByRole('link', { name: 'Fixture AI deployment fund' });
  await expect(link).toHaveAttribute('href', 'https://example.org/ai-fund');
  await expect(link).toHaveAttribute('rel', /noopener/);
  const rolling = page.locator('.opportunity', { hasText: 'Fixture rolling supplier list' });
  await expect(rolling).toContainText('Opportunity');
  await expect(rolling).toContainText('Wales');
  await expect(rolling).toContainText('No closing date');
  expect(await page.locator('script:not([src])').count()).toBe(0);
  expect(await page.locator('style').count()).toBe(0);
  await expectNoAxeViolations(page);
  expect(violations).toEqual([]);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/opportunities');
  await noSideScroll(page);
  await expectNoAxeViolations(page);

  // Linked from the explorer header and the events page.
  await page.goto('/events');
  await expect(page.getByRole('link', { name: /funding calls and opportunities/i }).first()).toHaveAttribute('href', '/opportunities');
  await page.goto('/');
  await expect(page.locator('.site-header').getByRole('link', { name: /funding calls and opportunities/i })).toHaveAttribute('href', '/opportunities');
});

test('filters by cluster and kind by keyboard', async ({ page }) => {
  await page.goto('/opportunities');
  const status = page.getByRole('status');
  await expect(status).toHaveText('Showing 4 of 4 funding calls and opportunities.');

  const cluster = page.getByRole('combobox', { name: 'Cluster' });
  await cluster.focus();
  await page.keyboard.type('South Central');
  await expect(cluster).toHaveValue('SCRDSC');
  await expect.poll(() => titles(page)).toEqual(['Fixture request for information', 'Fixture security reviews']);
  await expect(status).toHaveText('Showing 2 of 4 funding calls and opportunities.');
  await expect.poll(() => new URL(page.url()).searchParams.get('cluster')).toBe('SCRDSC');

  const funding = page.getByRole('radio', { name: 'Funding calls' });
  await funding.focus();
  await page.keyboard.press('Space');
  await expect(funding).toBeChecked();
  await expect.poll(() => titles(page)).toEqual(['Fixture security reviews']);
  await expect.poll(() => new URL(page.url()).searchParams.get('kind')).toBe('funding');
  await expectNoAxeViolations(page);

  // The filter is restored from the URL; unknown values are ignored.
  await page.goto('/opportunities?cluster=LRDSC&kind=funding');
  await expect.poll(() => titles(page)).toEqual(['Fixture AI deployment fund']);
  await page.goto('/opportunities?cluster=NOPE&kind=grant');
  await expect.poll(() => titles(page)).toHaveLength(4);

  await page.goto('/opportunities?cluster=WalesDSC&kind=funding');
  await expect(status).toHaveText('Showing 0 of 4 funding calls and opportunities.');
  await expect(page.getByText('No funding calls or opportunities match this filter.')).toBeVisible();
});
