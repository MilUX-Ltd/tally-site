// Test support: answer every request to the map tile host locally, so journey
// tests never touch the network. The style is a plain background; glyphs and
// tiles come back empty.
import type { Page } from '@playwright/test';

const TILE_HOST = 'https://tiles.openfreemap.org';

export const offlineStyle = {
  version: 8,
  glyphs: `${TILE_HOST}/fonts/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f2f3f0' } }],
};

export async function useOfflineMap(page: Page): Promise<void> {
  await page.route(`${TILE_HOST}/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/styles/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(offlineStyle) });
    } else if (url.includes('/fonts/')) {
      await route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    } else {
      await route.fulfill({ status: 404, body: '' });
    }
  });
}

/** Waits until the map has drawn the current companies. */
export async function waitForMap(page: Page): Promise<void> {
  await page.locator('#tally-map[data-ready="true"]').waitFor({ timeout: 20_000 });
}

/** Clicks the map at a longitude and latitude. */
export async function clickMapAt(page: Page, lon: number, lat: number): Promise<void> {
  const map = page.locator('#tally-map');
  const point = await map.evaluate(
    (el, lngLat) => (el as unknown as { tallyMap: { project: (p: [number, number]) => { x: number; y: number } } }).tallyMap.project(lngLat),
    [lon, lat] as [number, number],
  );
  const box = await map.boundingBox();
  if (!box) throw new Error('map has no box');
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
