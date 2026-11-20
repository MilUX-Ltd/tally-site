// Acceptance tests for the site icon (Matt, 20 November 2026: "it needs a favicon").
// Committed failing before the build.
import { expect, test } from '@playwright/test';

test('1. every page names an SVG icon and an Apple touch icon', async ({ page }) => {
  for (const path of ['/', '/about/', '/companies/example-cyber-defence/']) {
    await page.goto(path);
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/favicon.svg');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  }
});

test('2. the icons are served from the site', async ({ request }) => {
  const svg = await request.get('/favicon.svg');
  expect(svg.status()).toBe(200);
  expect(await svg.text()).toContain('<svg');
  for (const [path, type] of [
    ['/favicon.ico', 'image/'],
    ['/apple-touch-icon.png', 'image/png'],
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toContain(type);
  }
});
