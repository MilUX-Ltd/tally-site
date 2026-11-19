// Acceptance journeys: a page for each company, linked from the explorer,
// with a shortlist link back and a sitemap. Fixture build.
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, useOfflineMap, waitForMap } from '../support/offline-map';

const CYBER = '/companies/example-cyber-defence/';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('every company gets a page', async ({ page, request }) => {
  const data = await (await request.get('/data/tally.json')).json();
  expect(data.companies.length).toBeGreaterThan(30);
  for (const c of data.companies as Array<{ id: string; name: string }>) {
    const response = await request.get(`/companies/${c.id}/`);
    expect(response.status(), c.id).toBe(200);
    expect(await response.text()).toContain(c.name.replace(/&/g, '&amp;'));
  }
  await page.goto(CYBER);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Example Cyber Defence');
});

test('a company page shows what Tally holds', async ({ page }) => {
  await page.goto(CYBER);
  const main = page.locator('main');
  await expect(main).toContainText('Example Cyber Defence is a synthetic company used only in tests.');

  // What they do: safe Markdown, raw HTML shown as text only.
  await expect(page.getByRole('heading', { name: 'What they do' })).toBeVisible();
  await expect(main.locator('strong', { hasText: 'networks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'their approach' })).toHaveAttribute('href', 'https://example.com/approach');
  await expect(main).toContainText("<script>alert('x')</script>");
  await expect(main.locator('script')).toHaveCount(0);
  await expect(main.locator('img')).toHaveCount(0);

  // Products: a list; the javascript: link is text.
  await expect(page.getByRole('heading', { name: 'Products and solutions' })).toBeVisible();
  await expect(main.getByRole('listitem').filter({ hasText: 'Red Team Kit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'bad link' })).toHaveCount(0);
  await expect(main).toContainText('bad link');

  // Capabilities under their group.
  await expect(page.getByRole('heading', { name: 'Cyber, data and software' })).toBeVisible();
  await expect(main).toContainText('Cyber / Pen Testing');

  // Facts.
  for (const text of ['Small', 'London', 'G-Cloud', 'Cyber Essentials Plus', 'CREST', 'techUK']) await expect(main).toContainText(text);
  await expect(main.locator('time[datetime="2026-06-29"]')).toContainText('29 June 2026');

  // A small static map with a marker, and a text alternative.
  const map = page.getByRole('img', { name: /map/i });
  await expect(map).toBeVisible();
  await expect(map.locator('circle')).toHaveCount(1);

  // Links out.
  const website = page.getByRole('link', { name: /website/i }).first();
  await expect(website).toHaveAttribute('href', 'https://example.com/example-cyber-defence');
  await expect(website).toHaveAttribute('rel', /noopener/);
  await expect(website).toHaveAttribute('rel', /nofollow/);
  const linkedin = page.getByRole('link', { name: /linkedin/i });
  await expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/company/example-cyber-defence');
  await expect(linkedin).toHaveAttribute('rel', /noopener/);
  await expect(linkedin).toHaveAttribute('rel', /nofollow/);

  await expect(page.getByRole('link', { name: /back to the explorer/i })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: /add .*to shortlist/i })).toBeVisible();
});

test('overseas and unplaced companies have no map point', async ({ page }) => {
  await page.goto('/companies/example-nordic-defence/');
  await expect(page.locator('main')).toContainText('Norway');
  await expect(page.locator('main svg circle')).toHaveCount(0);

  await page.goto('/companies/example-unplaced-ltd/');
  await expect(page.locator('main')).toContainText(/location not known/i);
  await expect(page.locator('main svg circle')).toHaveCount(0);
  // Its javascript: website is never a link.
  await expect(page.locator('main a[href^="javascript:"]')).toHaveCount(0);
});

test('company page is accessible at desktop and phone width', async ({ page }) => {
  await page.goto(CYBER);
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(CYBER);
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  await page.goto('/companies/example-nordic-defence/');
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
});

test('company names link to their pages', async ({ page }) => {
  await useOfflineMap(page);
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('.results').getByRole('link', { name: 'Example Avionics', exact: true })).toHaveAttribute(
    'href',
    '/companies/example-avionics/',
  );
  await expect(page.locator('.matrix tbody').getByRole('link', { name: 'Example Avionics', exact: true })).toHaveAttribute(
    'href',
    '/companies/example-avionics/',
  );
  await expect(page.locator('.overseas').getByRole('link', { name: 'Example Nordic Defence', exact: true })).toHaveAttribute(
    'href',
    '/companies/example-nordic-defence/',
  );

  // What a click on the map shows: the area list.
  await page.goto('/?sel=example-avionics');
  await waitForMap(page);
  await expect(page.locator('.area').getByRole('link', { name: 'Example Avionics', exact: true })).toHaveAttribute(
    'href',
    '/companies/example-avionics/',
  );

  await page.locator('.results').getByRole('link', { name: 'Example Avionics', exact: true }).click();
  await expect(page).toHaveURL(/\/companies\/example-avionics\/$/);
});

test('add to shortlist from a company page', async ({ page }) => {
  await useOfflineMap(page);
  // Reached from the explorer with a shortlist: the shortlist is kept.
  await page.goto('/?list=example-avionics');
  await waitForMap(page);
  await page.locator('.results').getByRole('link', { name: 'Example Cyber Defence', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${CYBER}$`));
  await page.getByRole('link', { name: /add .*to shortlist/i }).click();
  await waitForMap(page);
  expect(new URL(page.url()).searchParams.get('list')).toBe('example-avionics,example-cyber-defence');
  const shortlist = page.getByRole('region', { name: 'Shortlist' });
  await expect(shortlist).toContainText('Example Avionics');
  await expect(shortlist).toContainText('Example Cyber Defence');

  // Reached directly: this company alone.
  await page.goto(CYBER);
  await page.getByRole('link', { name: /add .*to shortlist/i }).click();
  await waitForMap(page);
  expect(new URL(page.url()).searchParams.get('list')).toBe('example-cyber-defence');
});

test('sitemap lists every page', async ({ request }) => {
  const data = await (await request.get('/data/tally.json')).json();
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const xml = await response.text();
  for (const path of ['/', '/about/', '/events/']) expect(xml).toContain(`<loc>https://tally.milux.co.uk${path}</loc>`);
  for (const c of data.companies as Array<{ id: string }>) expect(xml).toContain(`<loc>https://tally.milux.co.uk/companies/${c.id}/</loc>`);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://tally.milux.co.uk/sitemap.xml');
});

test('company pages have titles, descriptions and canonical URLs', async ({ page }) => {
  await page.goto(CYBER);
  await expect(page).toHaveTitle(/Example Cyber Defence/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Example Cyber Defence is a synthetic company/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://tally.milux.co.uk${CYBER}`);
  await page.goto('/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tally.milux.co.uk/');
});
