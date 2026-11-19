// Acceptance journeys: the cluster map view. Fixture build, map tiles stubbed.
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, clickMapAt, useOfflineMap, waitForMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const params = (url: string) => new URL(url).searchParams;
type TestMap = {
  getSource: (id: string) => { getData: () => Promise<{ features: unknown[] }> } | undefined;
  getPaintProperty: (layer: string, name: string) => unknown;
};
const featureCount = (page: Page, source: string) =>
  page.locator('#tally-map').evaluate(async (el, id) => {
    const src = (el as unknown as { tallyMap: TestMap }).tallyMap.getSource(id);
    return src ? (await src.getData()).features.length : -1;
  }, source);
const hexOpacity = (page: Page) =>
  page.locator('#tally-map').evaluate((el) => (el as unknown as { tallyMap: TestMap }).tallyMap.getPaintProperty('hex-fill', 'fill-opacity'));
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
const legend = (page: Page) => page.getByRole('list', { name: 'Clusters on the map' });

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('the cluster map button draws every area labelled and fades the companies', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const button = page.getByRole('button', { name: 'Cluster map' });
  const checkbox = page.getByRole('group', { name: 'Clusters' }).getByRole('checkbox', { name: 'Show cluster areas on the map' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(hexOpacity(page)).resolves.toBe(0.72);

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => params(page.url()).get('clusters')).toBe('1');
  await expect(checkbox).toBeChecked();
  await expect.poll(() => featureCount(page, 'cluster-regions')).toBe(16);
  await expect.poll(() => featureCount(page, 'cluster-labels')).toBe(16);
  await expect.poll(() => hexOpacity(page)).toBe(0.25);

  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => params(page.url()).get('clusters')).toBeNull();
  await expect(checkbox).not.toBeChecked();
  await expect.poll(() => featureCount(page, 'cluster-labels')).toBe(0);
  await expect.poll(() => hexOpacity(page)).toBe(0.72);

  // The panel checkbox and the button are the same switch.
  await checkbox.check();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => featureCount(page, 'cluster-labels')).toBe(16);
});

test('companies can be brought back on top', async ({ page }) => {
  await page.goto('/?clusters=1');
  await waitForMap(page);
  const onTop = page.getByRole('checkbox', { name: 'Show companies on top' });
  await expect(onTop).not.toBeChecked();
  await expect.poll(() => hexOpacity(page)).toBe(0.25);
  await onTop.focus();
  await page.keyboard.press('Space');
  await expect(onTop).toBeChecked();
  await expect.poll(() => params(page.url()).get('ontop')).toBe('1');
  await expect.poll(() => hexOpacity(page)).toBe(0.72);

  await page.goto('/?clusters=1&ontop=1');
  await waitForMap(page);
  await expect(page.getByRole('checkbox', { name: 'Show companies on top' })).toBeChecked();
  await expect.poll(() => hexOpacity(page)).toBe(0.72);
});

test('the legend lists every cluster with members and events', async ({ page }) => {
  await page.goto('/?clusters=1');
  await waitForMap(page);
  const list = legend(page);
  await expect(list.getByRole('button')).toHaveCount(16);
  const sc = list.getByRole('button', { name: /^South Central/ });
  await expect(sc).toContainText('3 Tally members');
  await expect(sc).toContainText('2 upcoming events');
  const london = list.getByRole('button', { name: /^London/ });
  await expect(london).toContainText('members not recorded');
  await expect(london).toContainText('1 upcoming event');
  const note = page.locator('.cluster-map-note');
  await expect(note).toContainText('approximate');
  await expect(note).toContainText('overlap');
  await expect(note).toContainText('no cluster');

  await expect(sc).toHaveAttribute('aria-pressed', 'false');
  await sc.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('cluster')).toBe('SCRDSC');
  await expect(sc).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#result-count')).toContainText('3 companies match');
  await expect(page.getByLabel('Companies in a cluster')).toHaveValue('SCRDSC');

  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('cluster')).toBeNull();
  await expect(sc).toHaveAttribute('aria-pressed', 'false');
});

test('selecting an area on the map chooses its cluster', async ({ page }) => {
  await page.goto('/?clusters=1');
  await waitForMap(page);
  await expect.poll(() => featureCount(page, 'cluster-regions')).toBe(16);
  // A point in mid Wales.
  await clickMapAt(page, -3.5, 52.0);
  await expect.poll(() => params(page.url()).get('cluster')).toBe('WalesDSC');
  await expect(legend(page).getByRole('button', { name: /^Wales/ })).toHaveAttribute('aria-pressed', 'true');
});

test('the cluster map is accessible at desktop and phone width', async ({ page }) => {
  await page.goto('/?clusters=1&cluster=SCRDSC');
  await waitForMap(page);
  await expect(legend(page)).toBeVisible();
  await expectNoAxeViolations(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?clusters=1&cluster=SCRDSC');
  await waitForMap(page);
  await expect(legend(page)).toBeVisible();
  await noSideScroll(page);
  await expectNoAxeViolations(page);
});
