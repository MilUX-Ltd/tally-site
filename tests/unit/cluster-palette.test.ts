// The cluster map's palette: every live cluster distinct, neighbours never
// alike, clusters not yet live drawn as an outline, house colours kept.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimClusters } from '../../scripts/fetch-data.mjs';
import { legendEntries, MAP_COLOURS, mapColour, NOT_LIVE_COLOUR, rankedRegions, type ClustersData, type RegionsData } from '../../src/lib/clusters';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const clusters = slimClusters(read('../fixtures/clusters.json')) as ClustersData;
const regions = read('../../public/clusters/cluster-regions.geojson') as RegionsData;

// Areas that touch or overlap.
const NEIGHBOURS = [
  ['SWRDSC', 'WRDSC'], ['SWRDSC', 'SCRDSC'], ['WRDSC', 'WalesDSC'], ['WRDSC', 'WMRDSC'], ['WRDSC', 'OBCRDSC'], ['WRDSC', 'SCRDSC'],
  ['SCRDSC', 'LRDSC'], ['SCRDSC', 'OBCRDSC'], ['OBCRDSC', 'WMRDSC'], ['OBCRDSC', 'EMRDSC'], ['OBCRDSC', 'ERDSC'], ['OBCRDSC', 'LRDSC'],
  ['LRDSC', 'ERDSC'], ['ERDSC', 'EMRDSC'], ['ERDSC', 'GLRDSC'], ['WalesDSC', 'WMRDSC'], ['WalesDSC', 'NWRDSC'], ['WMRDSC', 'NWRDSC'],
  ['WMRDSC', 'EMRDSC'], ['EMRDSC', 'GLRDSC'], ['EMRDSC', 'YRDSC'], ['EMRDSC', 'NWRDSC'], ['GLRDSC', 'YRDSC'], ['YRDSC', 'NWRDSC'],
  ['YRDSC', 'NERDSC'], ['NWRDSC', 'NERDSC'],
];

/** CIE76 colour difference between two hex colours. */
function deltaE(a: string, b: string) {
  const lab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047);
    const y = f(0.2126 * r + 0.7152 * g + 0.0722 * bl);
    const z = f((0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe('cluster map palette', () => {
  const byId = new Map(clusters.clusters.map((c) => [c.id, c]));

  it('gives every live cluster its own colour', () => {
    const live = clusters.clusters.filter((c) => c.status === 'live');
    expect(live).toHaveLength(13);
    const colours = live.map(mapColour);
    expect(new Set(colours).size).toBe(13);
    for (const c of live) expect(MAP_COLOURS[c.id], c.id).toBeTruthy();
  });

  it('keeps neighbouring areas clearly different', () => {
    for (const [a, b] of NEIGHBOURS) expect(deltaE(mapColour(byId.get(a)!), mapColour(byId.get(b)!)), `${a} ${b}`).toBeGreaterThan(25);
  });

  it('draws clusters not yet live as an outline, and keeps house colours as data', () => {
    for (const id of ['NIDSC', 'ScotlandDSC', 'SERDSC']) expect(mapColour(byId.get(id)!)).toBe(NOT_LIVE_COLOUR);
    const ranked = rankedRegions(regions.features, null, clusters.clusters);
    const sc = ranked.features.find((f) => f.properties.id === 'SCRDSC')!;
    expect(sc.properties).toMatchObject({ colour: '#8B1A3A', mapColour: MAP_COLOURS.SCRDSC, live: true });
    expect(ranked.features.find((f) => f.properties.id === 'NIDSC')!.properties.live).toBe(false);
    const entry = legendEntries(clusters.clusters, [], []).find((e) => e.id === 'SCRDSC')!;
    expect(entry).toMatchObject({ colour: '#8B1A3A', mapColour: MAP_COLOURS.SCRDSC });
  });
});
