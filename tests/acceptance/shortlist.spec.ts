// Acceptance journeys: shortlist, share link, CSV, book a call.
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS, listView, openShortlist, useOfflineMap, waitForMap } from '../support/offline-map';

const params = (url: string) => new URL(url).searchParams;
const shortlist = (page: Page) => page.getByRole('region', { name: 'Shortlist' });

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await useOfflineMap(page);
});

test('a shortlist is built, held in the URL and restored', async ({ page, context }) => {
  await page.goto('/');
  await waitForMap(page);
  await listView(page);
  await page.getByRole('button', { name: 'Add Example Avionics to shortlist' }).click();
  await page.getByRole('button', { name: 'Add Example Composites to shortlist' }).click();
  await expect.poll(() => params(page.url()).get('list')).toBe('example-avionics,example-composites');
  await openShortlist(page);
  await expect(shortlist(page)).toContainText('Example Avionics');
  await expect(shortlist(page)).toContainText('Example Composites');
  await expect(page.getByRole('button', { name: 'Remove Example Avionics from shortlist' }).first()).toBeVisible();
  await expectNoAxeViolations(page);

  const fresh = await context.newPage();
  await useOfflineMap(fresh);
  await fresh.goto(page.url());
  await waitForMap(fresh);
  await openShortlist(fresh);
  await expect(shortlist(fresh)).toContainText('Example Avionics');
  await expect(shortlist(fresh)).toContainText('Example Composites');
  await shortlist(fresh).getByRole('button', { name: 'Remove Example Avionics from shortlist' }).click();
  await expect.poll(() => params(fresh.url()).get('list')).toBe('example-composites');
  await expect(shortlist(fresh)).not.toContainText('Example Avionics');
});

test('the shortlist downloads as CSV', async ({ page }) => {
  await page.goto('/?list=example-subsea,example-cyber-defence');
  await waitForMap(page);
  const [download] = await Promise.all([page.waitForEvent('download'), shortlist(page).getByRole('button', { name: /download as a spreadsheet \(csv\)/i }).click()]);
  expect(download.suggestedFilename()).toBe('tally-shortlist.csv');
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  expect(lines[0]).toBe('Name,Website,LinkedIn,Headquarters,Region,Country,Postcode,Location source,Size,Capabilities,Accreditations,Frameworks,Memberships,Summary');
  expect(lines).toHaveLength(3);
  expect(lines[1].startsWith('Example Subsea,')).toBe(true);
  expect(lines[2].startsWith('Example Cyber Defence,')).toBe(true);
});

test('the shortlist link can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?list=example-subsea&cap=maritime');
  await waitForMap(page);
  await openShortlist(page);
  const link = shortlist(page).getByRole('textbox', { name: /link to this shortlist/i });
  const value = await link.inputValue();
  expect(params(value).get('list')).toBe('example-subsea');
  await shortlist(page).getByRole('button', { name: 'Copy link' }).click();
  await expect(shortlist(page)).toContainText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  await expectNoAxeViolations(page);
});

test('book a call and the AI line are present', async ({ page }) => {
  await page.goto('/?list=example-subsea');
  await waitForMap(page);
  const book = page.getByRole('link', { name: 'Talk to MilUX about this shortlist' }).first();
  await expect(book).toBeVisible();
  await expect(book).toHaveAttribute('href', 'https://milux.co.uk/contact/');
  await expect(page.getByText('using AI-assisted engineering').first()).toBeVisible();
});

test('the shortlist works by keyboard alone', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await listView(page);
  await page.getByRole('button', { name: 'Add Example Avionics to shortlist' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('list')).toBe('example-avionics');
  await openShortlist(page);
  await shortlist(page).getByRole('button', { name: /download as a spreadsheet \(csv\)/i }).focus();
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('tally-shortlist.csv');
  await shortlist(page).getByRole('button', { name: 'Remove Example Avionics from shortlist' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => params(page.url()).get('list')).toBeNull();
  await expectNoAxeViolations(page);
});

test('the shortlist fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?list=example-subsea,example-cyber-defence');
  await waitForMap(page);
  await expect(shortlist(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);
});
