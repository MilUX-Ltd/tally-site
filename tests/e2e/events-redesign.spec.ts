// Acceptance journeys: the redesigned Clusters and events page (Tally
// redesign, slice C). Fixture build; the page runs no script. Members-only
// events stay signposts wherever they appear. Committed failing before the
// build.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS } from '../support/offline-map';

const SIGNPOST = "Members' event: join the cluster for details";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
const sideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('opens with the kicker, the headline, one purpose sentence and a fact strip', async ({ page }) => {
  await page.goto('/events');
  const hero = page.locator('header.page-hero');
  await expect(hero.locator('.kicker')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Regional defence clusters.');
  await expect(hero.locator('h1 .stop')).toHaveText('.');
  await expect(hero.locator('.lede')).toHaveCount(1);
  // From the fixture: 16 clusters, 13 of them live, 5 upcoming events, the next on 10 March 2099.
  const fact = (label: string) => hero.locator('dl.facts div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`, 'i') }) }).locator('dd');
  await expect(fact('Clusters')).toHaveText('16');
  await expect(fact('Live')).toHaveText('13');
  await expect(fact('Upcoming events')).toHaveText('5');
  await expect(fact('Next event')).toHaveText('10 Mar 2099');
  await expect(page.locator('header.topbar nav.topbar-nav a[aria-current="page"]')).toHaveText('Clusters and events');
});

test('the map draws every cluster region and pins the upcoming events, without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/events');
  const atlas = page.locator('figure#cluster-map');
  const map = atlas.locator('svg.atlas-wide');
  await expect(map).toBeVisible();
  await expect(map.locator('[data-region]')).toHaveCount(16);
  // Clusters that are not yet live are drawn differently from live ones.
  await expect(map.locator('[data-region][data-live="false"]')).toHaveCount(3);
  // Four clusters have upcoming events in the fixture; South Central has two.
  await expect(map.locator('[data-pin]')).toHaveCount(4);
  await expect(map.locator('[data-pin="SCRDSC"]')).toHaveText('2');
  // Every cluster is named on the map, and its name leads to its card.
  await expect(map.locator('a.atlas-label')).toHaveCount(16);
  await expect(map.locator('a.atlas-label', { hasText: 'South Central' })).toHaveAttribute('href', '#c-SCRDSC');
  // A legend explains the fills, the pin and the dashed outline.
  const legend = atlas.locator('.atlas-legend');
  await expect(legend).toContainText(/upcoming events/i);
  await expect(legend).toContainText(/not yet live/i);
  await context.close();
});

test('the map has a text alternative', async ({ page }) => {
  await page.goto('/events');
  const atlas = page.locator('figure#cluster-map');
  await atlas.locator('summary', { hasText: /as a table/i }).click();
  const table = atlas.getByRole('table', { name: /clusters on the map/i });
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(16);
  const row = table.locator('tbody tr', { hasText: 'South Central' });
  await expect(row).toContainText('Hampshire, Surrey, West Sussex, Isle of Wight');
  await expect(row).toContainText('Live');
  await expect(row).toContainText('10 Mar 2099');
  await expect(table.locator('tbody tr', { hasText: 'Scotland' })).toContainText('Proposed');
});

test('at phone width the map is one picture with the same regions and pins', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/events');
  const atlas = page.locator('figure#cluster-map');
  await expect(atlas.locator('svg.atlas-wide')).toBeHidden();
  const map = atlas.locator('svg.atlas-narrow');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('role', 'img');
  await expect(map.locator('[data-region]')).toHaveCount(16);
  await expect(map.locator('[data-pin]')).toHaveCount(4);
});

test('Next up is a timeline with large date numerals, soonest first', async ({ page }) => {
  await page.goto('/events');
  const section = page.getByRole('region', { name: 'Next up' });
  await expect(section.getByRole('heading', { level: 2, name: 'Next up' })).toBeVisible();
  const items = section.locator('ol.next-up > li');
  await expect(items).toHaveCount(5);
  expect(await items.locator('time').evaluateAll((els) => els.map((el) => el.getAttribute('datetime')))).toEqual(['2099-03-10', '2099-03-18', '2099-04-02', '2099-04-20', '2099-04-20']);
  const first = items.first();
  await expect(first.locator('.next-day')).toHaveText('10');
  await expect(first.locator('.next-month')).toContainText(/Mar 2099/i);
  const size = await first.locator('.next-day').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(48);
  await expect(first).toContainText('Fixture maritime showcase');
  await expect(first).toContainText('South Central');
  // A members-only event is a signpost here too: cluster, date, the fixed line and the cluster's public site.
  const members = items.nth(1);
  await expect(members).toContainText('South Central');
  await expect(members).toContainText(SIGNPOST);
  await expect(members.getByRole('link')).toHaveCount(1);
  await expect(members.getByRole('link')).toHaveAttribute('href', 'https://www.southcentralrdsc.co.uk/');
});

test('each cluster has a card with its area, status, members, links, next event and a link to Find', async ({ page }) => {
  await page.goto('/events');
  const cards = page.locator('article.cluster-card');
  await expect(cards).toHaveCount(16);

  const sc = page.locator('article#c-SCRDSC');
  await expect(sc.getByRole('heading', { level: 3 })).toHaveText('South Central');
  await expect(sc).toContainText('Hampshire, Surrey, West Sussex, Isle of Wight');
  await expect(sc.locator('.cluster-status')).toHaveText('Live');
  await expect(sc.locator('.cluster-members')).toContainText('3');
  await expect(sc.getByRole('link', { name: 'South Central cluster website' })).toHaveAttribute('href', 'https://www.southcentralrdsc.co.uk/');
  await expect(sc.getByRole('link', { name: 'South Central cluster on LinkedIn' })).toHaveAttribute('href', /^https:\/\/www\.linkedin\.com\/company\//);
  await expect(sc.locator('.cluster-next')).toContainText('10 Mar 2099');
  await expect(sc.locator('.cluster-next')).toContainText('Fixture maritime showcase');
  await expect(sc.getByRole('link', { name: /South Central.*on Find/ })).toHaveAttribute('href', '/?cluster=SCRDSC');

  // A cluster whose next event is for members shows only the signpost.
  const wales = page.locator('article#c-WalesDSC');
  await expect(wales.locator('.cluster-next')).toContainText('20 Apr 2099');
  await expect(wales.locator('.cluster-next')).toContainText(SIGNPOST);

  // Tally records no members for London; Scotland is proposed and has no links or events.
  const london = page.locator('article#c-LRDSC');
  await expect(london.locator('.cluster-members')).toContainText(/not recorded/i);
  await expect(london.getByRole('link', { name: /London.*on Find/ })).toHaveAttribute('href', '/?cluster=LRDSC');
  const scotland = page.locator('article#c-ScotlandDSC');
  await expect(scotland.locator('.cluster-status')).toHaveText('Proposed');
  await expect(scotland.locator('.cluster-next')).toContainText(/no upcoming events/i);
  await expect(scotland.getByRole('link', { name: /cluster website|LinkedIn/ })).toHaveCount(0);
  await expect(scotland.getByRole('link', { name: /Scotland.*on Find/ })).toHaveAttribute('href', '/?cluster=ScotlandDSC');
});

test('the calendar and the full list stay, and the events download as a calendar file', async ({ page, request }) => {
  await page.goto('/events');
  await expect(page.getByRole('table', { name: 'March 2099' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'April 2099' })).toBeVisible();
  await page.getByRole('link', { name: /^2 April 2099/ }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe('#d-2099-04-02');
  await expect(page.locator('.event', { hasText: 'Fixture supplier day' })).toContainText('Lincoln');

  const download = page.getByRole('link', { name: /calendar file/i });
  await expect(download).toHaveAttribute('href', '/events.ics');
  const response = await request.get('/events.ics');
  expect(response.ok()).toBe(true);
  const ics = (await response.text()).replace(/\r\n[ \t]/g, '');
  expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect(ics.trimEnd()).toMatch(/END:VCALENDAR$/);
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
  expect(ics).toContain('SUMMARY:Fixture maritime showcase (South Central)');
  expect(ics).toContain('DTSTART;VALUE=DATE:20990310');
  expect(ics).not.toContain('Fixture past showcase');
  // Members-only events are signposts in the file as well: the fixed line, the cluster and its public site.
  const members = ics.split('BEGIN:VEVENT').filter((block) => block.includes("Members' event"));
  expect(members).toHaveLength(2);
  for (const block of members) {
    expect(block).toMatch(/SUMMARY:Members' event: join the cluster for details \((South Central|Wales)\)/);
    expect(block).not.toMatch(/^(LOCATION|DESCRIPTION):/m);
    expect(block).toMatch(/URL:https:\/\/(www\.southcentralrdsc\.co\.uk|walesdsc\.co\.uk)\//);
  }
});

test('members-only events are never shown in full anywhere on the page', async ({ page }) => {
  await page.goto('/events');
  // Every place a members-only event appears carries the fixed line and one link, to the cluster's public site.
  const signposts = page.locator('[data-audience="members"]');
  expect(await signposts.count()).toBeGreaterThanOrEqual(4);
  for (const item of await signposts.all()) {
    await expect(item).toContainText(SIGNPOST);
    const hrefs = await item.getByRole('link').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs.length).toBeLessThanOrEqual(1);
    for (const href of hrefs) expect(['https://www.southcentralrdsc.co.uk/', 'https://walesdsc.co.uk/']).toContain(href);
  }
  // The rule is stated once.
  await expect(page.getByText(/Members-only events are shown only as a date/)).toHaveCount(1);
});

test('overlap and colour notes are a short footnote', async ({ page }) => {
  await page.goto('/events');
  const notes = page.locator('.area-notes');
  await expect(notes).toContainText(/overlap/i);
  await expect(notes).toContainText(/not the clusters' own brand colours/i);
  await expect(notes).toContainText(/Open Government Licence/);
  expect((await notes.innerText()).length).toBeLessThan(700);
  // After the clusters and the events, not before them.
  const order = await page.evaluate(() => {
    const notesEl = document.querySelector('.area-notes') as Element;
    const lastEvent = [...document.querySelectorAll('.event')].pop() as Element;
    return notesEl.compareDocumentPosition(lastEvent) & Node.DOCUMENT_POSITION_PRECEDING;
  });
  expect(order).toBeTruthy();
});

test('floors: axe at 1440 and 390, no sideways scroll at 320, headings in order', async ({ page }) => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/events');
    await expectNoAxeViolations(page);
    expect(await sideScroll(page)).toBe(0);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/events');
  expect(await sideScroll(page)).toBe(0);
  await expectNoAxeViolations(page);

  const levels = await page.locator('main :is(h1, h2, h3, h4, h5, h6)').evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
  expect(levels[0]).toBe(1);
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading ${i}`).toBeLessThanOrEqual(1);
});

test('floors: no script, no inline styles and no motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/events');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Regional defence clusters.');
  expect(await page.locator('script').count()).toBe(0);
  expect(await page.locator('[style]').count()).toBe(0);
  expect(await page.locator('style').count()).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
