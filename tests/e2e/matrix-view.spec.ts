// Acceptance tests for the Matrix view: the capability matrix as a view of
// its own beside Map and List. Fixture build; map tiles are answered by the
// test, so nothing leaves the test machine. Committed failing before the build.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MATRIX_PAGE_SIZE } from '../../src/lib/matrix';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/tally-data.json', import.meta.url), 'utf8')) as {
  companies: Array<{ name: string }>;
};
const TOTAL = fixture.companies.length;
const CYBER = ['Example Analytics North', 'Example Cyber Defence', 'Example Nordic Defence', 'Example Secure Comms', 'Example Signals Intelligence'];

const params = (url: string) => new URL(url).searchParams;
async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
const noSideScroll = async (page: Page, width: number) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

const view = (page: Page, name: 'Map' | 'List' | 'Matrix') => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true });
const section = (page: Page) => page.getByRole('region', { name: 'Compare capabilities', exact: true });
const heading = (page: Page) => page.getByRole('heading', { name: 'Compare capabilities', exact: true });
const matrix = (page: Page) => page.getByRole('table', { name: /compare capabilities/i });
const rowNames = async (page: Page) => (await matrix(page).locator('tbody th[scope="row"]').allInnerTexts()).map((t) => t.trim()).sort();
const results = (page: Page) => page.getByRole('list', { name: 'Results' });
const compare = (page: Page) => page.getByRole('button', { name: 'Compare capabilities', exact: true });
const groups = (page: Page) => page.getByRole('radiogroup', { name: 'Capabilities shown' });
const shortlistButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: /shortlist/i });

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('the view switch shows the matrix full width with no map', async ({ page }) => {
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await view(page, 'Matrix').click();
  await expect(view(page, 'Matrix')).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page, 'Map')).toHaveAttribute('aria-pressed', 'false');
  await expect(view(page, 'List')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => params(page.url()).get('view')).toBe('matrix');

  // The matrix for the current results, the whole width, and the map out of reach.
  await expect.poll(() => rowNames(page)).toEqual(CYBER);
  await expect(section(page)).toContainText('5 companies');
  const viewport = page.viewportSize() as { width: number };
  const box = (await section(page).boundingBox()) as { width: number };
  expect(box.width).toBeGreaterThan(viewport.width * 0.9);
  await expect(page.locator('.map-wrap')).toHaveAttribute('inert', '');
  await expect(page.getByRole('group', { name: 'Map style' })).toHaveCount(0);
  await expect(results(page)).toHaveCount(0);
  // The filters stay in reach: the search and the chips.
  await expect(page.getByRole('list', { name: 'Active filters' })).toContainText('Cyber');
  await expect(page.getByRole('search')).toBeVisible();

  // Back to the map: the results beside it, and the address without the view.
  await view(page, 'Map').click();
  await expect.poll(() => params(page.url()).get('view')).toBeNull();
  await expect(page.locator('.map-wrap')).not.toHaveAttribute('inert', '');
  await expect(matrix(page)).toHaveCount(0);
  await expect(results(page).getByRole('listitem')).toHaveCount(5);
});

test('from the landing page, Matrix compares every company, a page at a time', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await view(page, 'Matrix').click();
  await expect(matrix(page).locator('tbody tr')).toHaveCount(MATRIX_PAGE_SIZE);
  await expect(section(page)).toContainText(`${TOTAL} companies`);
  const pager = page.getByRole('navigation', { name: 'Matrix rows' });
  await expect(pager).toContainText(`Rows 1 to ${MATRIX_PAGE_SIZE} of ${TOTAL}`);
  await pager.getByRole('button', { name: /next/i }).click();
  await expect.poll(() => params(page.url()).get('mpage')).toBe('2');
  await expect(matrix(page).locator('tbody tr')).toHaveCount(TOTAL - MATRIX_PAGE_SIZE);
  await expect(pager).toContainText(`Rows ${MATRIX_PAGE_SIZE + 1} to ${TOTAL} of ${TOTAL}`);
  // Having looked, the map comes back with the results beside it.
  await view(page, 'Map').click();
  await expect(page.getByRole('region', { name: 'Results' })).toBeVisible();
  await expect.poll(() => params(page.url()).get('mpage')).toBeNull();
});

test('view=matrix is held in the address and restored on load; other values are dropped', async ({ page }) => {
  await page.goto('/?view=matrix&cap=cyber');
  await waitForMap(page);
  await expect(view(page, 'Matrix')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => rowNames(page)).toEqual(CYBER);
  expect(params(page.url()).get('view')).toBe('matrix');
  await page.reload();
  await waitForMap(page);
  await expect(view(page, 'Matrix')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => rowNames(page)).toEqual(CYBER);

  await page.goto('/?view=<script>&cap=cyber');
  await waitForMap(page);
  await expect(view(page, 'Map')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => params(page.url()).get('view')).toBeNull();
  await expect(matrix(page)).toHaveCount(0);
});

test('old links naming a matrix page or group open the Matrix view', async ({ page }) => {
  await page.goto('/?mpage=2');
  await waitForMap(page);
  await expect(view(page, 'Matrix')).toHaveAttribute('aria-pressed', 'true');
  await expect(matrix(page).locator('tbody tr')).toHaveCount(TOTAL - MATRIX_PAGE_SIZE);
  await expect.poll(() => params(page.url()).get('view')).toBe('matrix');
  expect(params(page.url()).get('mpage')).toBe('2');

  await page.goto('/?mgroup=cyber-data-software&cap=cyber');
  await waitForMap(page);
  await expect(view(page, 'Matrix')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => rowNames(page)).toEqual(CYBER);
  await expect(matrix(page).getByRole('checkbox', { name: 'Filter by Cyber', exact: true })).toBeChecked();
  await expect(matrix(page).getByRole('checkbox', { name: 'Filter by Space', exact: true })).toHaveCount(0);
  await expect(groups(page).getByRole('radio', { name: 'Cyber, data and software', exact: true })).toBeChecked();

  // A link that names its view keeps it.
  await page.goto('/?mgroup=cyber-data-software&view=list');
  await waitForMap(page);
  await expect(view(page, 'List')).toHaveAttribute('aria-pressed', 'true');
  await expect(matrix(page)).toHaveCount(0);
});

test('Compare capabilities, in the results panel and the List view, opens the matrix', async ({ page }) => {
  // Beside the map.
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await expect(matrix(page)).toHaveCount(0);
  await page.getByRole('region', { name: 'Results' }).getByRole('button', { name: 'Compare capabilities', exact: true }).click();
  await expect(view(page, 'Matrix')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => params(page.url()).get('view')).toBe('matrix');
  await expect.poll(() => rowNames(page)).toEqual(CYBER);
  await expect(heading(page)).toBeFocused();

  // In the List view, where the matrix no longer sits under the rows.
  await page.goto('/?cap=cyber&view=list');
  await waitForMap(page);
  await expect(results(page).getByRole('listitem')).toHaveCount(5);
  await expect(matrix(page)).toHaveCount(0);
  await expect(heading(page)).toHaveCount(0);
  await compare(page).click();
  await expect.poll(() => params(page.url()).get('view')).toBe('matrix');
  await expect.poll(() => rowNames(page)).toEqual(CYBER);

  // From the shortlist, it compares the shortlist.
  await page.goto('/?list=example-subsea,example-cyber-defence');
  await waitForMap(page);
  await page.getByRole('region', { name: 'Shortlist' }).getByRole('button', { name: 'Compare capabilities', exact: true }).click();
  await expect.poll(() => rowNames(page)).toEqual(['Example Cyber Defence', 'Example Subsea']);
  await expect(section(page)).toContainText('2 companies on your shortlist');
});

test('the matrix keeps its behaviour: groups, ticking a column, shortlisting a row and company links', async ({ page }) => {
  await page.goto('/?view=matrix');
  await waitForMap(page);

  // A real table: a caption, column headers in their groups, a row header per company.
  await expect(matrix(page).locator('caption')).toHaveCount(1);
  await expect(matrix(page).locator('thead th[scope="colgroup"]').first()).toBeVisible();
  await expect(matrix(page).locator('thead th[scope="col"]').first()).toBeVisible();
  expect(await matrix(page).locator('tbody th[scope="row"]').count()).toBe(MATRIX_PAGE_SIZE);

  // Capability groups: one choice at a time, held in the address.
  await expect(groups(page).getByRole('radio', { name: 'All groups', exact: true })).toBeChecked();
  await groups(page).getByRole('radio', { name: 'Cyber, data and software', exact: true }).check();
  await expect.poll(() => params(page.url()).get('mgroup')).toBe('cyber-data-software');
  await expect(matrix(page).getByRole('checkbox', { name: 'Filter by Space', exact: true })).toHaveCount(0);
  await groups(page).getByRole('radio', { name: 'All groups', exact: true }).check();
  await expect.poll(() => params(page.url()).get('mgroup')).toBeNull();
  await expect(matrix(page).getByRole('checkbox', { name: 'Filter by Space', exact: true })).toHaveCount(1);

  // Ticking a column filters, as it always has.
  await matrix(page).getByRole('checkbox', { name: 'Filter by Cyber', exact: true }).check();
  await expect.poll(() => params(page.url()).get('cap')).toBe('cyber');
  await expect.poll(() => rowNames(page)).toEqual(CYBER);
  await expect(page.locator('#result-count')).toContainText('5 companies');
  await expect(page.getByRole('list', { name: 'Active filters' })).toContainText('Cyber');

  // Each company links to its page and has its own shortlist button.
  const row = matrix(page).getByRole('row', { name: /Example Cyber Defence/ });
  await expect(row.getByRole('link', { name: 'Example Cyber Defence', exact: true })).toHaveAttribute('href', '/companies/example-cyber-defence/');
  await row.getByRole('button', { name: 'Add Example Cyber Defence to shortlist', exact: true }).click();
  await expect.poll(() => params(page.url()).get('list')).toBe('example-cyber-defence');
  await expect(page.locator('#shortlist-count')).toHaveText('1');
  await row.getByRole('button', { name: 'Remove Example Cyber Defence from shortlist', exact: true }).click();
  await expect.poll(() => params(page.url()).get('list')).toBeNull();
});

test('with the shortlist open, the matrix compares the shortlist', async ({ page }) => {
  await page.goto('/?view=matrix&list=example-secure-comms,example-subsea');
  await waitForMap(page);
  // A link that names the view opens on the results, not the shortlist.
  await expect(matrix(page).locator('tbody tr')).toHaveCount(MATRIX_PAGE_SIZE);
  await shortlistButton(page).click();
  await expect.poll(() => rowNames(page)).toEqual(['Example Secure Comms', 'Example Subsea']);
  await expect(section(page)).toContainText('2 companies on your shortlist');
  await expect(heading(page)).toBeFocused();
  await expect(view(page, 'Matrix')).toHaveAttribute('aria-pressed', 'true');
  // The shortlist's own tools come with it.
  await expect(section(page).getByRole('button', { name: /download as a spreadsheet \(csv\)/i })).toBeVisible();
  await section(page).getByRole('button', { name: 'Remove Example Subsea from shortlist', exact: true }).click();
  await expect.poll(() => rowNames(page)).toEqual(['Example Secure Comms']);
  await section(page).getByRole('button', { name: 'Back to results', exact: true }).click();
  await expect(matrix(page).locator('tbody tr')).toHaveCount(MATRIX_PAGE_SIZE);
  await expect(section(page)).not.toContainText('on your shortlist');
});

test('the first column and the header rows stay in place while the table scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?view=matrix');
  await waitForMap(page);
  const scroller = page.getByRole('region', { name: /compare capabilities table/i });
  const company = matrix(page).locator('tbody th[scope="row"]').first();
  const head = matrix(page).locator('thead th[scope="col"]').nth(3);
  // The heading and the group choices scroll away first; then the header rows hold at the top.
  const top = await scroller.evaluate((el) => {
    el.scrollTo(0, (el.querySelector('table') as HTMLElement).offsetTop + 40);
    return el.scrollTop;
  });
  const before = { company: (await company.boundingBox()) as { x: number }, head: (await head.boundingBox()) as { y: number } };
  const moved = await scroller.evaluate((el) => {
    el.scrollBy(240, 200);
    return { left: el.scrollLeft, top: el.scrollTop };
  });
  expect(moved.left).toBeGreaterThan(100);
  expect(moved.top).toBeGreaterThan(top + 100);
  const after = { company: (await company.boundingBox()) as { x: number }, head: (await head.boundingBox()) as { y: number } };
  expect(Math.abs(after.company.x - before.company.x)).toBeLessThan(2);
  expect(Math.abs(after.head.y - before.head.y)).toBeLessThan(2);
  // The header rows sit at the top of the scrolling card, over the rows.
  const box = (await scroller.boundingBox()) as { y: number };
  const group = (await matrix(page).locator('thead th[scope="colgroup"]').first().boundingBox()) as { y: number };
  expect(Math.abs(group.y - box.y)).toBeLessThan(3);
});

test('keyboard: the switch moves focus to the heading, and the table is reached and scrolled without a mouse', async ({ page }) => {
  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await view(page, 'Matrix').focus();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toBeFocused();
  // The group choice works with the arrow keys.
  await groups(page).getByRole('radio', { name: 'All groups', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => params(page.url()).get('mgroup')).not.toBeNull();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => params(page.url()).get('mgroup')).toBeNull();
  // The scrolling table takes focus, and a column is ticked with Space.
  const scroller = page.getByRole('region', { name: /compare capabilities table/i });
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const space = matrix(page).getByRole('checkbox', { name: 'Filter by Space', exact: true });
  await space.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => params(page.url()).get('cap')).toBe('cyber,space');
});

test('phone: axe passes, nothing scrolls sideways at 390 or 320, and Map, List and Matrix fit the bottom bar', async ({ page }) => {
  test.slow();
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    for (const path of ['/?view=matrix', '/?cap=cyber&view=matrix', '/?cap=cyber', '/']) {
      await page.goto(path);
      await waitForMap(page);
      await noSideScroll(page, size.width);
      // The three views sit side by side, inside the screen.
      const boxes = [];
      for (const name of ['Map', 'List', 'Matrix'] as const) {
        await expect(view(page, name)).toBeVisible();
        boxes.push((await view(page, name).boundingBox()) as { x: number; y: number; width: number; height: number });
      }
      expect(boxes[0].x).toBeGreaterThanOrEqual(0);
      expect(boxes[2].x + boxes[2].width).toBeLessThanOrEqual(size.width);
      expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(2);
      for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(24);
      for (const control of [page.getByRole('button', { name: /^Filters/ }), page.getByRole('button', { name: 'Layers', exact: true })]) {
        const box = (await control.boundingBox()) as { x: number; width: number };
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      }
    }
    // The table scrolls inside its card; the page does not.
    await page.goto('/?view=matrix');
    await waitForMap(page);
    await expect(matrix(page).locator('tbody tr')).toHaveCount(MATRIX_PAGE_SIZE);
    const scroller = page.getByRole('region', { name: /compare capabilities table/i });
    const wide = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(wide.scroll).toBeGreaterThan(wide.client);
    const card = (await section(page).boundingBox()) as { x: number; width: number };
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(size.width);
    await expectNoAxeViolations(page);
    // The pager is in reach, above the bottom bar.
    const next = page.getByRole('navigation', { name: 'Matrix rows' }).getByRole('button', { name: /next/i });
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect.poll(() => params(page.url()).get('mpage')).toBe('2');
    await noSideScroll(page, size.width);

    await page.goto('/?view=matrix&list=example-subsea,example-cyber-defence');
    await waitForMap(page);
    await shortlistButton(page).click();
    await expect.poll(() => rowNames(page)).toEqual(['Example Cyber Defence', 'Example Subsea']);
    await noSideScroll(page, size.width);
    await expectNoAxeViolations(page);
  }
});

test('desktop: axe passes in the Matrix view, for results and for the shortlist, and nothing animates under reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/?view=matrix', '/?cap=cyber&view=matrix&mgroup=cyber-data-software']) {
    await page.goto(path);
    await waitForMap(page);
    await expect(matrix(page)).toBeVisible();
    await noSideScroll(page, 1440);
    await expectNoAxeViolations(page);
  }
  await shortlistButton(page).click();
  await expect(section(page)).toContainText('on your shortlist');
  await expectNoAxeViolations(page);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?view=matrix');
  await waitForMap(page);
  await expect(matrix(page)).toBeVisible();
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll('.find *')].map((el) => getComputedStyle(el)).filter((s) => parseFloat(s.transitionDuration) > 0 || parseFloat(s.animationDuration) > 0).length,
  );
  expect(moving).toBe(0);
});
