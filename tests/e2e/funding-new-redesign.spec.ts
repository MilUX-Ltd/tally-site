// Acceptance journeys: the redesigned Funding (/opportunities) and New
// companies (/new) pages. Fixture build. Committed failing before the build.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
const scrollWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

/** Heading levels never skip downwards (h1, then h2, then h3 and so on). */
async function expectHeadingsInOrder(page: Page) {
  const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((els) => els.map((el) => Number(el.tagName.slice(1))));
  expect(levels[0]).toBe(1);
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading ${i + 1} of ${levels.join(' ')}`).toBeLessThanOrEqual(1);
}

/** Opens a page at each floor size and checks the floors. */
async function expectFloors(page: Page, path: string) {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(path);
    await expectNoAxeViolations(page);
    expect(await scrollWidth(page)).toBeLessThanOrEqual(size.width);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(path);
  expect(await scrollWidth(page)).toBeLessThanOrEqual(320);
  await expectHeadingsInOrder(page);
  expect(await page.locator('script:not([src])').count()).toBe(0);
  expect(await page.locator('style').count()).toBe(0);
  expect(await page.locator('main [style]').count()).toBe(0);
}

const call = (page: Page, title: string) => page.locator('.opportunity', { hasText: title });

test.describe('Funding', () => {
  test('opens with the kicker, headline, purpose and facts from the data', async ({ page }) => {
    await page.goto('/opportunities');
    const hero = page.locator('header.page-hero');
    await expect(hero.locator('.kicker')).toBeVisible();
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Funding and opportunities.');
    await expect(hero.locator('.lede')).toContainText('regional defence and security clusters');
    const facts = hero.locator('dl.facts');
    await expect(facts.locator('div', { hasText: 'Open calls' }).locator('dd')).toHaveText('4');
    await expect(facts.locator('div', { hasText: 'Closing in 30 days' }).locator('dd')).toHaveText('0');
    await expect(page.locator('header.topbar .topbar-nav a[aria-current="page"]')).toHaveText('Funding');
  });

  test('the deadline board counts down in the browser from each closing date', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (m.text().includes('Content Security Policy')) violations.push(m.text());
    });
    await page.clock.setFixedTime(new Date('2099-03-02T09:00:00Z'));
    await page.goto('/opportunities');
    const board = page.getByRole('region', { name: 'Deadline board' });
    const ai = call(page, 'Fixture AI deployment fund');
    await expect(board.locator('.opportunity').first()).toContainText('Fixture AI deployment fund');
    await expect(ai.locator('.countdown')).toHaveText(/^\s*10\s*days left\s*$/);
    await expect(ai).toContainText('Closes 12 March 2099, 12:00');
    await expect(call(page, 'Fixture request for information').locator('.countdown')).toHaveText(/^\s*30\s*days left\s*$/);
    await expect(call(page, 'Fixture security reviews').locator('.countdown')).toHaveText(/^\s*89\s*days left\s*$/);

    // The bar fills as the deadline nears, and its colour steps up the data ramp.
    const fill = (title: string) => call(page, title).locator('.deadline-bar .fill');
    const width = async (title: string) => Number(await fill(title).getAttribute('width'));
    expect(await width('Fixture AI deployment fund')).toBeGreaterThan(await width('Fixture request for information'));
    expect(await width('Fixture request for information')).toBeGreaterThan(await width('Fixture security reviews'));
    expect(await width('Fixture AI deployment fund')).toBeLessThanOrEqual(100);
    await expect(call(page, 'Fixture AI deployment fund')).toHaveAttribute('data-urgency', '3');
    await expect(call(page, 'Fixture security reviews')).toHaveAttribute('data-urgency', '1');
    await expect(page.locator('header.page-hero dl.facts div', { hasText: 'Closing in 30 days' }).locator('dd')).toHaveText('2');

    // Calls without a deadline come after, under their own heading, with no countdown.
    const open = page.getByRole('region', { name: 'No closing date' });
    await expect(open.locator('.opportunity')).toHaveCount(1);
    await expect(open.locator('.opportunity')).toContainText('Fixture rolling supplier list');
    await expect(open.locator('.opportunity .countdown')).not.toContainText('days');
    expect(violations).toEqual([]);

    // One day, the day itself, and the day after.
    await page.clock.setFixedTime(new Date('2099-03-11T09:00:00Z'));
    await page.goto('/opportunities');
    await expect(ai.locator('.countdown')).toHaveText(/^\s*1\s*day left\s*$/);
    await expect(ai).toHaveAttribute('data-urgency', '4');
    await page.clock.setFixedTime(new Date('2099-03-12T09:00:00Z'));
    await page.goto('/opportunities');
    await expect(ai.locator('.countdown')).toHaveText(/^\s*0\s*days left\s*$/);
    await expect(ai).toContainText('Closes today');
    await page.clock.setFixedTime(new Date('2099-03-13T09:00:00Z'));
    await page.goto('/opportunities');
    await expect(ai.locator('.countdown')).toContainText('Closed');
    await expect(ai.locator('.countdown')).not.toContainText('days');
  });

  test('without JavaScript the board shows the dates and the whole list', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/opportunities');
    await expect(page.locator('.opportunity')).toHaveCount(4);
    const ai = call(page, 'Fixture AI deployment fund');
    await expect(ai).toContainText('Closes 12 March 2099, 12:00');
    await expect(ai.locator('.countdown')).toBeVisible();
    await expect(ai.locator('.countdown')).toContainText('12');
    await expect(ai.locator('.countdown')).toContainText('Mar 2099');
    await expect(page.getByText('days left')).toHaveCount(0);
    await expect(page.locator('#opp-filter')).toBeHidden();
    await context.close();
  });

  test('filter chips narrow the board and are held in the address', async ({ page }) => {
    await page.goto('/opportunities');
    const kinds = page.getByRole('group', { name: 'Kind' });
    const clusters = page.getByRole('group', { name: 'Cluster' });
    await expect(kinds.getByRole('radio')).toHaveCount(3);
    await expect(clusters.getByRole('radio', { name: 'All clusters' })).toBeChecked();
    await clusters.getByText('South Central', { exact: true }).click();
    await expect(page.locator('.opportunity:visible')).toHaveCount(2);
    await expect(page.getByRole('status')).toHaveText('Showing 2 of 4 funding calls and opportunities.');
    await expect.poll(() => new URL(page.url()).searchParams.get('cluster')).toBe('SCRDSC');
    // A group with nothing left to show goes with its heading.
    await expect(page.getByRole('heading', { name: 'No closing date' })).toBeHidden();
    await kinds.getByText('Opportunities', { exact: true }).click();
    await expect(page.locator('.opportunity:visible')).toHaveCount(1);
    await expectNoAxeViolations(page);
    await clusters.getByText('All clusters', { exact: true }).click();
    await kinds.getByText('All', { exact: true }).click();
    await expect(page.locator('.opportunity:visible')).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'No closing date' })).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
  });

  test('says to check with the funder beside the list', async ({ page }) => {
    await page.goto('/opportunities');
    const note = page.getByRole('main').getByRole('complementary', { name: 'Before you apply' });
    await expect(note).toContainText('Check with the funder before you apply.');
    await expect(note).toContainText('Members-only items are not listed');
  });

  test('meets the floors at 1440, 390 and 320', async ({ page }) => {
    await expectFloors(page, '/opportunities');
  });
});

const growth = (page: Page) => page.getByRole('region', { name: 'Growth over time' });

test.describe('New companies', () => {
  test('opens with the kicker, headline, purpose and the feed link', async ({ page }) => {
    await page.goto('/new');
    const hero = page.locator('header.page-hero');
    await expect(hero.locator('.kicker')).toBeVisible();
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('New on Tally.');
    await expect(hero.locator('.lede')).toContainText('Companies added in the last 12 weeks, newest first.');
    await expect(hero.getByRole('link', { name: /rss feed/i })).toHaveAttribute('href', '/new/feed.xml');
    const facts = hero.locator('dl.facts');
    await expect(facts.locator('div', { hasText: 'Companies' }).first().locator('dd')).toHaveText('32');
    await expect(facts.locator('div', { hasText: 'Added in 12 weeks' }).locator('dd')).toHaveText('6');
    await expect(page.locator('header.topbar .topbar-nav a[aria-current="page"]')).toHaveText('New companies');
  });

  test('the growth of the directory is drawn from the history, with a table', async ({ browser }) => {
    // Built into the page: it reads the same with JavaScript off.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/new');
    await expect(growth(page)).toContainText('November 2026: 32 companies');
    const chart = growth(page).getByRole('img', { name: /Companies in Tally by month, from 20 in June 2026 to 32 in November 2026/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator('.column')).toHaveCount(6);
    const fills = await chart.locator('.column .top').evaluateAll((els) => els.map((el) => el.getAttribute('fill')?.toLowerCase()));
    expect(fills[0]).toBe('#f2d9a6');
    expect(fills[5]).toBe('#8a2b0a');
    // Every capability group, for the month shown.
    await expect(growth(page).locator('.growth-groups tbody tr')).toHaveCount(10);
    await expect(growth(page).getByRole('row', { name: /^Domains, platforms and weapons/ }).getByRole('cell').first()).toHaveText('14');
    // The table alternative holds every month and group.
    await growth(page).locator('summary', { hasText: 'Show the figures as a table' }).click();
    const table = growth(page).getByRole('table', { name: 'Companies in Tally by month and capability group' });
    await expect(table.getByRole('row')).toHaveCount(7);
    const june = table.getByRole('row', { name: /^June 2026/ });
    await expect(june.getByRole('cell').first()).toHaveText('20');
    await expect(june.getByRole('cell').nth(1)).toHaveText('11');
    await expect(table.getByRole('row', { name: /^September 2026/ })).toContainText('no update');
    await expect(growth(page).getByRole('slider')).toHaveCount(0);
    await context.close();
  });

  test('a month opens from its address and the chart marks it', async ({ page }) => {
    await page.goto('/new?month=2026-06');
    await expect(growth(page)).toContainText('June 2026: 20 companies');
    await expect(growth(page).locator('.column.is-current')).toHaveCount(1);
    await expect(growth(page).locator('.column').first()).toHaveClass(/is-current/);
    await expect(growth(page).getByRole('row', { name: /^Space/ }).getByRole('cell').first()).toHaveText('0');
    await growth(page).getByRole('slider', { name: 'Month' }).focus();
    await page.keyboard.press('End');
    await expect(growth(page).locator('.column').last()).toHaveClass(/is-current/);
    await expect(growth(page)).toContainText('November 2026: 32 companies');
  });

  test('nothing replays under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/new');
    await expect(growth(page).getByRole('slider', { name: 'Month' })).toBeVisible();
    await expect(growth(page).getByRole('button', { name: 'Play' })).toBeHidden();
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('main *')].filter((el) => {
        const s = getComputedStyle(el);
        return s.animationName !== 'none' || parseFloat(s.transitionDuration) > 0;
      }).length,
    );
    expect(animated).toBe(0);
  });

  test('a strip shows how many were added each week', async ({ page }) => {
    await page.goto('/new');
    const strip = page.getByRole('list', { name: 'Companies added each week' });
    await expect(strip.getByRole('listitem')).toHaveCount(12);
    const latest = strip.getByRole('listitem').last();
    await expect(latest).toContainText('2');
    await expect(latest).toContainText('16 Nov');
    await expect(strip.getByRole('listitem').first()).toContainText('31 Aug');
    await expect(strip.getByRole('listitem').first()).toContainText('0');
    await expect(strip.getByRole('link')).toHaveCount(2);
    const october = strip.getByRole('link', { name: /4 companies added in the week of 12 October 2026/ });
    await october.click();
    await expect(page).toHaveURL(/#w-2026-10-12$/);
  });

  test('additions sit by week on a date rail, the latest week open', async ({ page }) => {
    await page.goto('/new');
    const weeks = page.locator('section.new-week');
    await expect(weeks).toHaveCount(2);
    const latest = weeks.first();
    await expect(latest.getByRole('heading', { level: 2 })).toHaveText('Week of 16 November 2026');
    await expect(latest.locator('.rail')).toContainText('16');
    await expect(latest.locator('.rail')).toContainText('Nov 2026');
    await expect(latest).toContainText('2 companies');
    await expect(latest.locator('details')).toHaveAttribute('open', '');
    await expect(latest.locator('.new-company')).toHaveCount(2);
    await expect(latest.getByRole('link', { name: 'Example Vehicles' })).toBeVisible();

    const earlier = weeks.nth(1);
    await expect(earlier).toContainText('4 companies');
    await expect(earlier.getByRole('link', { name: 'Example Subsea' })).toBeHidden();
    await earlier.locator('summary').click();
    const subsea = earlier.getByRole('link', { name: 'Example Subsea' });
    await expect(subsea).toBeVisible();
    await subsea.click();
    await expect(page).toHaveURL(/\/companies\/example-subsea\/$/);

    // A link from the strip opens its week.
    await page.goto('/new#w-2026-10-12');
    await expect(page.locator('section.new-week').nth(1).getByRole('link', { name: 'Example Subsea' })).toBeVisible();
  });

  test('meets the floors at 1440, 390 and 320', async ({ page }) => {
    await expectFloors(page, '/new');
  });
});
