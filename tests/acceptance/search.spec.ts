// Acceptance journeys: plain-English search. Fixture build, map tiles stubbed,
// and /api/search answered by the test (the preview server has no Worker).
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { AXE_TAGS, matrixView, openFilters, useOfflineMap, waitForMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const params = (url: string) => new URL(url).searchParams;
const matrix = (page: Page) => page.getByRole('table', { name: /compare capabilities/i });
const rowNames = async (page: Page) => (await matrix(page).locator('tbody th[scope="row"]').allInnerTexts()).map((t) => t.trim()).sort();
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'What do you need?' });
const searchStatus = (page: Page) => page.locator('#search-status');

/** Answers /api/search and records what the page sent. */
async function answerSearch(page: Page, answer: (route: Route) => Promise<void>) {
  const sent: unknown[] = [];
  await page.route('**/api/search', async (route) => {
    sent.push(route.request().postDataJSON());
    await answer(route);
  });
  return sent;
}

const json = (body: unknown, status = 200) => async (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('plain-English search sets the filters', async ({ page }) => {
  const sent = await answerSearch(
    page,
    json({
      fallback: false,
      filters: { cap: ['cyber', 'not-a-capability'], size: [], region: [], fw: [], accr: ['accr-ce-plus'], mbr: [] },
      capmatch: 'any',
      site: null,
      radius: 25,
    }),
  );
  await page.goto('/');
  await waitForMap(page);

  // Keyboard only: the box is reachable and Enter submits.
  const box = searchBox(page);
  await expect(box).toHaveAttribute('maxlength', '300');
  await box.focus();
  await page.keyboard.type('cyber firms with Cyber Essentials Plus');
  await page.keyboard.press('Enter');

  await expect.poll(() => params(page.url()).get('cap')).toBe('cyber');
  await expect.poll(() => params(page.url()).get('accr')).toBe('accr-ce-plus');
  expect(params(page.url()).get('q')).toBeNull();
  expect(sent).toEqual([{ q: 'cyber firms with Cyber Essentials Plus' }]);

  // Cyber (or a sub-capability) and Cyber Essentials Plus, in the UK fixture.
  await expect(page.locator('#result-count')).toContainText('2 companies');
  await matrixView(page);
  await expect.poll(() => rowNames(page)).toEqual(['Example Cyber Defence', 'Example Signals Intelligence']);
  await openFilters(page);
  await expect(page.getByRole('checkbox', { name: 'Cyber Essentials Plus' })).toBeChecked();

  // The page says, in its own words, which filters were set.
  await expect(searchStatus(page)).toHaveAttribute('role', 'status');
  await expect(searchStatus(page)).toContainText('Cyber');
  await expect(searchStatus(page)).toContainText('Cyber Essentials Plus');
  await expect(searchStatus(page)).not.toContainText('not-a-capability');
  await expect(searchStatus(page)).not.toContainText(/keyword/i);
  await expectNoAxeViolations(page);
});

test('falls back to keyword search and says so', async ({ page }) => {
  await answerSearch(page, json({ fallback: true }));
  await page.goto('/');
  await waitForMap(page);

  await searchBox(page).fill('counter drone');
  await searchBox(page).press('Enter');

  await expect(searchStatus(page)).toContainText(/searched company names, summaries and tags for/i);
  await expect.poll(() => params(page.url()).get('q')).toBe('counter drone');
  await expect(page.locator('#result-count')).toContainText('1 company');
  await matrixView(page);
  await expect.poll(() => rowNames(page)).toEqual(['Example Counter Drone']);
  await expectNoAxeViolations(page);

  // The keyword view opens from its URL, and works at phone width.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?q=counter%20drone');
  await waitForMap(page);
  await expect(searchBox(page)).toHaveValue('counter drone');
  await matrixView(page);
  await expect.poll(() => rowNames(page)).toEqual(['Example Counter Drone']);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);

  // It can be cleared by keyboard.
  const clear = page.getByRole('button', { name: 'Remove Keyword: counter drone' });
  await clear.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('q')).toBeNull();
  await expect(page.locator('#result-count')).toContainText('57 companies');
});

test('a failing search route still gives a keyword search', async ({ page }) => {
  await answerSearch(page, json({ error: 'boom' }, 500));
  await page.goto('/');
  await waitForMap(page);
  await searchBox(page).fill('photonics');
  await searchBox(page).press('Enter');
  await expect(searchStatus(page)).toContainText(/searched company names, summaries and tags for/i);
  await matrixView(page);
  await expect.poll(() => rowNames(page)).toEqual(['Example Photonics']);
  await expectNoAxeViolations(page);
});
