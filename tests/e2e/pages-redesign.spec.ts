// Acceptance journeys for the redesigned About, company, Ask Tally and 404
// pages (specs/Tally Redesign, slice C). Fixture build.
// Committed failing before the build.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS } from '../support/offline-map';

const CYBER = '/companies/example-cyber-defence/';
const SPACE = '/companies/example-space-systems/';
const NORDIC = '/companies/example-nordic-defence/';
const UNPLACED = '/companies/example-unplaced-ltd/';
const NO_ACCREDITATIONS = '/companies/example-ew-systems/';
const NOT_FOUND = '/no-such-page-in-tally';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

/** axe at WCAG 2.2 AA, headings in order, nothing blocked by the CSP and no style attributes. */
async function expectFloors(page: Page, path: string) {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('Content Security Policy')) violations.push(m.text());
  });
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations, `${path} at ${size.width}`).toEqual([]);
  }
  // Headings: one h1, and no level skipped on the way down.
  const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading ${i} of ${path}`).toBeLessThanOrEqual(1);
  await expect(page.locator('[style]')).toHaveCount(0);
  await expect(page.locator('style')).toHaveCount(0);
  // No sideways scroll on the smallest phone.
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} at 320`).toBeLessThanOrEqual(0);
  expect(violations).toEqual([]);
}

/** The page opens in the house style: a kicker, then the headline. */
async function expectHouseHero(page: Page) {
  const hero = page.locator('main .page-hero');
  await expect(hero.locator('.kicker').first()).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  const family = await hero.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toMatch(/Manrope/);
}

test.describe('company page', () => {
  test('opens with the name, a location line, the two actions and the check line', async ({ page }) => {
    await page.setViewportSize(SIZES[0]);
    await page.goto(CYBER);
    await expectHouseHero(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Example Cyber Defence');

    const back = page.getByRole('link', { name: 'Back to search' });
    await expect(back).toHaveAttribute('href', '/');

    const location = page.locator('.company-location');
    await expect(location).toContainText('London');
    expect(await location.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Roboto Mono/);

    // Add to shortlist (primary) and Website, side by side.
    const actions = page.locator('.company-actions');
    const add = actions.getByRole('link', { name: /add .*to shortlist/i });
    const website = actions.getByRole('link', { name: /website/i });
    await expect(add).toHaveClass(/btn-primary/);
    await expect(website).toHaveAttribute('href', 'https://example.com/example-cyber-defence');
    const [a, w] = [await add.boundingBox(), await website.boundingBox()];
    expect(Math.abs((a?.y ?? 0) - (w?.y ?? 99))).toBeLessThanOrEqual(1);
    expect(w?.x ?? 0).toBeGreaterThan(a?.x ?? 0);

    const check = page.locator('.company-check');
    await expect(check).toHaveText('Last checked against public sources on 29 June 2026.');
    await expect(check.locator('time[datetime="2026-06-29"]')).toHaveText('29 June 2026');
    // The check line comes before the body of the page.
    const order = await page.evaluate(() => {
      const checkLine = document.querySelector('.company-check');
      const what = document.querySelector('#what-heading');
      return checkLine && what ? Boolean(checkLine.compareDocumentPosition(what) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    });
    expect(order).toBe(true);

    await page.goto(UNPLACED);
    await expect(page.locator('.company-check')).toHaveText('From public sources. Not yet checked.');
  });

  test('sections come in the content model order', async ({ page }) => {
    await page.goto(CYBER);
    const headings = await page.locator('main h2').allTextContents();
    expect(headings.map((h) => h.trim())).toEqual([
      'What they do',
      'Products and solutions',
      'Capabilities',
      'Defence contracts',
      'Where they are',
      'Accreditations',
      'Frameworks',
      'Memberships',
      'Founded and size',
    ]);
    const facts = page.locator('.company-record');
    await expect(facts).toContainText('G-Cloud');
    await expect(facts).toContainText('techUK');
    await expect(facts).toContainText('2020');
    await expect(facts).toContainText('Small');
    await expect(page.getByRole('link', { name: 'Correct this listing' })).toBeVisible();
  });

  test('capabilities are tags under their group, without repeating the group', async ({ page }) => {
    await page.goto(CYBER);
    const cyber = page.locator('.capability-group', { has: page.getByRole('heading', { name: 'Cyber, data and software' }) });
    await expect(cyber.locator('.tag')).toHaveText(['Cyber', 'Cyber / Pen Testing']);

    await page.goto(SPACE);
    const space = page.locator('.capability-group', { has: page.getByRole('heading', { name: 'Space', exact: true }) });
    await expect(space).toHaveCount(1);
    // "Space" under "Space" is not said twice; its sub-capabilities drop the repeated prefix.
    await expect(space.locator('.tag')).toHaveText(['Satellite', 'Ground Systems']);
  });

  test('a located company gets the locator: its point on the UK outline', async ({ page, request }) => {
    await page.goto(CYBER);
    const where = page.locator('section.company-where');
    await expect(where.getByRole('heading', { name: 'Where they are' })).toBeVisible();
    const map = where.getByRole('img', { name: /map of the UK/i });
    await expect(map).toBeVisible();
    await expect(map.locator('circle')).toHaveCount(1);
    await expect(map.locator('image')).toHaveAttribute('href', '/maps/uk.svg');
    await expect(where).toContainText('51.51°N');
    await expect(where).toContainText('0.13°W');
    await expect(where.getByRole('link', { name: 'Show on the Tally map' })).toHaveAttribute('href', /^\/\?sel=example-cyber-defence&map=9\//);
    // No map library on a company page: one small script and nothing from the tile host.
    const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((el) => el.getAttribute('src') ?? ''));
    expect(scripts.filter((s) => /maplibre/i.test(s))).toEqual([]);

    const outline = await request.get('/maps/uk.svg');
    expect(outline.status()).toBe(200);
    expect(outline.headers()['content-type']).toContain('image/svg+xml');
    // Each UK region has a shared outline a region-level page shades.
    for (const slug of ['south-west', 'london', 'yorkshire-and-the-humber', 'east-of-england', 'scotland', 'wales', 'northern-ireland']) {
      const region = await request.get(`/maps/region/${slug}.svg`);
      expect(region.status(), slug).toBe(200);
      expect(region.headers()['content-type']).toContain('image/svg+xml');
      expect(await region.text()).toContain('<path');
    }
  });

  test('an overseas company gets a plain country line and no region', async ({ page }) => {
    await page.goto(NORDIC);
    const where = page.locator('section.company-where');
    await expect(where).toContainText('Oslo, Norway');
    await expect(where).toContainText('Based outside the UK, so not on the UK map.');
    await expect(where.locator('svg')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Overseas');
    await expect(page.locator('.company-location')).toContainText('Oslo, Norway');
  });

  test('says "None recorded" the same way everywhere', async ({ page }) => {
    await page.goto(NO_ACCREDITATIONS);
    const section = (name: string) => page.locator('.company-record > *', { has: page.getByRole('heading', { name }) });
    await expect(section('Accreditations')).toContainText('None recorded');
    await expect(page.locator('main')).not.toContainText('None recorded in Tally');
    await page.goto(UNPLACED);
    for (const name of ['Accreditations', 'Frameworks', 'Memberships']) await expect(section(name)).toContainText('None recorded');
  });

  test('stays light: a small page with no inline styles', async ({ request }) => {
    const html = await (await request.get(CYBER)).text();
    expect(html.length).toBeLessThan(24_000);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toContain('<style');
  });

  for (const path of [CYBER, NORDIC, UNPLACED]) {
    test(`meets the floors: ${path}`, async ({ page }) => {
      await expectFloors(page, path);
    });
  }
});

test.describe('about page', () => {
  test('is an editorial page in the house style', async ({ page }) => {
    await page.goto('/about');
    await expectHouseHero(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/about tally/i);
    await expect(page.locator('main .page-hero .display')).toBeVisible();

    const headings = (await page.locator('main h2').allTextContents()).map((h) => h.trim());
    expect(headings).toEqual([
      'How Tally works',
      'Where the information comes from',
      'How the search uses AI',
      'Data sources and licences',
      'Get listed',
      'Correct a listing',
      'How it was built',
    ]);

    // Three numbered steps.
    const steps = page.locator('ol.steps > li');
    await expect(steps).toHaveCount(3);
    await expect(steps.locator('.step-number')).toHaveText(['01', '02', '03']);
    expect(await steps.locator('.step-number').first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Roboto Mono/);

    // The facts come from the data.
    const data = await (await page.request.get('/data/tally.json')).json();
    await expect(page.locator('main .facts')).toContainText(String(data.companies.length));
  });

  test('says how the search uses AI', async ({ page }) => {
    await page.goto('/about');
    const ai = page.locator('section', { has: page.getByRole('heading', { name: 'How the search uses AI' }) });
    await expect(ai).toContainText('An AI model (Claude, from Anthropic) turns the words you type into filters.');
    await expect(ai).toContainText('Tally does not keep what you type.');
  });

  test('holds the data sources and licences', async ({ page }) => {
    await page.goto('/about');
    const licences = page.locator('#licences');
    await expect(licences.getByRole('heading', { name: 'Data sources and licences' })).toBeVisible();
    for (const text of [
      'CC BY 4.0',
      'CC BY-NC 4.0',
      'What you type is sent to postcodes.io to find the place, and nothing else is sent.',
      'Places from Ordnance Survey and Office for National Statistics open data, Royal Mail and Crown copyright and database right, licensed Open Government Licence v3.0.',
      'widely published sites, each checked against its source. Locations from Wikipedia contributors, licensed CC BY-SA 4.0.',
      'Cluster areas: Office for National Statistics boundaries, licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2025. Areas are approximate.',
      'OpenFreeMap',
      'OpenStreetMap',
    ]) {
      await expect(licences).toContainText(text);
    }
    await expect(licences.getByRole('link', { name: 'postcodes.io' })).toHaveAttribute('href', 'https://postcodes.io');
    await expect(licences.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  });

  test('get listed and correct a listing sit in a forest call-out', async ({ page }) => {
    await page.goto('/about');
    const callout = page.locator('.callout');
    await expect(callout.getByRole('heading', { name: 'Get listed' })).toBeVisible();
    await expect(callout.getByRole('heading', { name: 'Correct a listing' })).toBeVisible();
    const href = (await callout.getByRole('link', { name: /get listed/i }).first().getAttribute('href')) ?? '';
    expect(href.startsWith('mailto:contact@milux.co.uk?')).toBe(true);
    expect(await callout.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(17, 51, 8)');
    await expect(page.locator('script')).toHaveCount(0);
  });

  test('meets the floors', async ({ page }) => {
    await expectFloors(page, '/about');
  });
});

test.describe('ask tally page', () => {
  test('is restyled for a technical reader', async ({ page }) => {
    await page.goto('/ask-tally');
    await expectHouseHero(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/ask tally/i);

    // The address and the command are mono code blocks with real contrast: light on ink.
    const address = page.locator('.code-block', { hasText: 'https://tally.milux.co.uk/mcp' }).first();
    await expect(address).toBeVisible();
    expect(await address.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(12, 21, 16)');
    expect(await address.locator('code').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Roboto Mono/);
    await expect(page.locator('.code-block', { hasText: 'claude mcp add --transport http tally https://tally.milux.co.uk/mcp' })).toBeVisible();

    // Numbered steps.
    const steps = page.locator('ol.steps > li');
    await expect(steps).toHaveCount(5);
    await expect(steps.first()).toContainText('Customize');
    await expect(steps.locator('.step-number')).toHaveText(['01', '02', '03', '04', '05']);

    // The content stays.
    for (const name of ['The connector address', 'Add it in Claude', 'Add it in other MCP clients', 'What your assistant can do', 'What it uses and what it keeps']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    for (const tool of ['search_companies', 'get_company', 'list_capabilities', 'list_clusters_and_events']) {
      await expect(page.locator('.tools').getByText(tool, { exact: true })).toBeVisible();
    }
    await expect(page.locator('main')).toContainText('Tally runs no AI model for the connector.');
    await expect(page.locator('script')).toHaveCount(0);
  });

  test('meets the floors', async ({ page }) => {
    await expectFloors(page, '/ask-tally');
  });
});

test.describe('404 page', () => {
  test('says what happened and gives a next step', async ({ page }) => {
    const response = await page.goto(NOT_FOUND);
    expect(response?.status()).toBe(404);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('404');
    await expect(h1).toContainText('Page not found');
    const size = await page.locator('.not-found-code').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(120);
    await expect(page.locator('.not-found-code .stop')).toHaveText('.');
    await expect(page.locator('main')).toContainText('If you typed the address, check it is correct. If you followed a link to a company, it may have been renamed.');
    await expect(page.getByRole('link', { name: 'Search for a company' })).toHaveAttribute('href', '/');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });

  test('meets the floors', async ({ page }) => {
    await expectFloors(page, '/404');
  });
});
