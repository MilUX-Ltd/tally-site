// Acceptance journeys: cluster regions overlay and cluster events. Fixture
// build, map tiles stubbed. Members-only events show only the signpost and a
// join link. Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const SIGNPOST = "Members' event: join the cluster for details";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const params = (url: string) => new URL(url).searchParams;
const matrix = (page: Page) => page.getByRole('table', { name: /capability matrix/i });
const rowNames = async (page: Page) => (await matrix(page).locator('tbody th[scope="row"]').allInnerTexts()).map((t) => t.trim()).sort();
const featureCount = (page: Page, source: string) =>
  page.locator('#tally-map').evaluate(async (el, id) => {
    const map = (el as unknown as { tallyMap: { getSource: (id: string) => { getData: () => Promise<{ features: unknown[] }> } | undefined } }).tallyMap;
    const src = map.getSource(id);
    return src ? (await src.getData()).features.length : -1;
  }, source);
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('picking a cluster filters companies to its members', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const panel = page.getByRole('group', { name: 'Clusters' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Office for National Statistics');
  await expect(panel.getByRole('link', { name: /Open Government Licence/ })).toBeVisible();
  const toggle = panel.getByRole('checkbox', { name: 'Show cluster areas on the map' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect.poll(() => params(page.url()).get('clusters')).toBe('1');
  await expect.poll(() => featureCount(page, 'cluster-regions')).toBe(16);
  await expectNoAxeViolations(page);

  const pick = page.getByLabel('Companies in a cluster');
  await pick.focus();
  await pick.selectOption({ label: 'South Central' });
  await expect.poll(() => params(page.url()).get('cluster')).toBe('SCRDSC');
  const members = ['Example EW Systems', 'Example Harbour Systems', 'Example Human Factors'];
  await expect(page.locator('#result-count')).toContainText('3 companies match');
  await expect(page.locator('#result-count')).toContainText('South Central');
  await expect.poll(() => rowNames(page)).toEqual(members);
  await expectNoAxeViolations(page);

  // A cluster whose members Tally does not record does not narrow the list.
  await pick.selectOption({ label: 'London' });
  await expect.poll(() => params(page.url()).get('cluster')).toBe('LRDSC');
  await expect(panel).toContainText('does not yet record');
  await expect(page.locator('#result-count')).toContainText('32 companies');

  // The view opens from its URL, and works at phone width.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?clusters=1&cluster=SCRDSC');
  await waitForMap(page);
  await expect(page.getByLabel('Companies in a cluster')).toHaveValue('SCRDSC');
  await expect.poll(() => rowNames(page)).toEqual(members);
  await noSideScroll(page);
  await expectNoAxeViolations(page);

  await page.goto('/?cluster=NoSuchCluster');
  await waitForMap(page);
  await expect.poll(() => params(page.url()).get('cluster')).toBeNull();
});

test('events appear on the map by cluster', async ({ page }) => {
  await page.goto('/?clusters=1');
  await waitForMap(page);
  // Four clusters have upcoming events in the fixture; the past one is not drawn.
  await expect.poll(() => featureCount(page, 'cluster-events')).toBe(4);
  const panel = page.getByRole('group', { name: 'Clusters' });
  await expect(panel.getByRole('link', { name: /upcoming cluster events/i })).toHaveAttribute('href', '/events');
});

test('lists upcoming events and a calendar', async ({ page }) => {
  await page.goto('/events');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Upcoming cluster events');
  await expect(page.getByText('Fixture maritime showcase')).toBeVisible();
  await expect(page.getByText('Fixture supplier day')).toBeVisible();
  await expect(page.getByText('Fixture innovation briefing')).toBeVisible();
  await expect(page.getByText('Fixture past showcase')).toHaveCount(0);
  const maritime = page.locator('.event', { hasText: 'Fixture maritime showcase' });
  await expect(maritime).toContainText('10:00 to 16:00');
  await expect(maritime).toContainText('Portsmouth');
  await expect(maritime).toContainText('South Central');
  await expect(maritime.getByRole('link')).toHaveAttribute('href', 'https://example.org/maritime');

  await expect(page.getByRole('table', { name: 'March 2099' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'April 2099' })).toBeVisible();
  const day = page.getByRole('link', { name: /^10 March 2099/ });
  await day.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => new URL(page.url()).hash).toBe('#d-2099-03-10');
  await expectNoAxeViolations(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/events');
  await noSideScroll(page);
  await expectNoAxeViolations(page);
});

test('members-only events show only the signpost and a join link', async ({ page }) => {
  await page.goto('/events');
  const items = page.locator('.event.members');
  await expect(items).toHaveCount(2);
  const expected = [
    { cluster: 'South Central', href: 'https://www.southcentralrdsc.co.uk/' },
    { cluster: 'Wales', href: 'https://walesdsc.co.uk/' },
  ];
  for (let i = 0; i < expected.length; i++) {
    const item = items.nth(i);
    await expect(item).toContainText(SIGNPOST);
    await expect(item).toContainText(expected[i].cluster);
    const links = item.getByRole('link');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveText('Join the cluster');
    await expect(links.first()).toHaveAttribute('href', expected[i].href);
  }
});
