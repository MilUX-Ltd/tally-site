// Acceptance journeys: overseas companies listed by country. The fixture is
// extended in the test with overseas companies, two of them carrying points
// that must never be drawn. Committed failing before the build. Not edited
// after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const extra = (name: string, country: string, tags: string[], lat: number | null, lon: number | null) => ({
  id: name.toLowerCase().replace(/ /g, '-'),
  name,
  website: 'https://example.com',
  linkedin: '',
  hq: country,
  region: 'Overseas',
  size: 'small',
  headcount: '',
  founded: '',
  tags: ['defence', ...tags],
  summary: `${name} is a synthetic overseas company for tests.`,
  lat,
  lon,
  postcode: '',
  location_source: '',
  country,
});

async function withOverseas(page: Page) {
  await page.route('**/data/tally.json', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.companies.push(
      extra('Example Atlantic Systems', 'United States', ['cyber'], 40.7128, -74.006),
      extra('Example Baltic Radar', 'Estonia', ['radar'], 59.437, 24.7536),
      extra('Example Rhine Optics', 'Germany', ['optronics'], null, null),
    );
    json.count = json.companies.length;
    await route.fulfill({ response, json });
  });
}

const section = (page: Page) => page.getByRole('region', { name: 'Overseas companies' });

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
  await withOverseas(page);
});

test('overseas companies are listed by country and follow the filters', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('#result-count')).toContainText('35 companies');
  await expect(page.locator('#result-count')).toContainText('30 on the map');
  await expect(section(page)).toBeVisible();
  expect(await section(page).locator('h3').allInnerTexts()).toEqual(['Europe', 'Rest of the world']);
  expect(await section(page).locator('h4').allInnerTexts()).toEqual(['Estonia', 'Germany', 'Norway', 'United States']);
  await expect(section(page)).toContainText('Example Nordic Defence');
  await expect(section(page)).toContainText('Example Atlantic Systems');
  await expect(section(page)).not.toContainText('Example Robotics');
  await expectNoAxeViolations(page);

  await page.goto('/?cap=cyber');
  await waitForMap(page);
  await expect(page.locator('#result-count')).toContainText('4 on the map');
  expect(await section(page).locator('h4').allInnerTexts()).toEqual(['Norway', 'United States']);
  await expect(section(page)).not.toContainText('Example Baltic Radar');

  await page.goto('/?cap=space');
  await waitForMap(page);
  await expect(section(page)).toContainText('No overseas companies match these filters.');
});

test('the overseas section is accessible at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await waitForMap(page);
  await section(page).scrollIntoViewIfNeeded();
  await expect(section(page).getByRole('heading', { name: 'Overseas companies' })).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);
});
