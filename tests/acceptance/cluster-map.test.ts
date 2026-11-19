// Acceptance tests: the cluster map view. Every cluster's area on one map,
// labelled, with a legend of members and upcoming events. Committed failing
// before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimClusters, slimData, slimEvents } from '../../scripts/fetch-data.mjs';
import { clusterLabels, legendEntries, rankedRegions, type ClustersData, type EventsData, type RegionsData } from '../../src/lib/clusters';
import type { TallyData } from '../../src/lib/types';
import { defaultState, fromQuery, toQuery } from '../../src/lib/url-state';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data = slimData(read('../fixtures/tally-data.json'), read('../fixtures/taxonomy.json')) as TallyData;
const clusters = slimClusters(read('../fixtures/clusters.json')) as ClustersData;
const events = slimEvents(read('../fixtures/events.json'), clusters, '2026-11-19') as EventsData;
const regions = read('../../public/clusters/cluster-regions.geojson') as RegionsData;

function inside([x, y]: number[], ring: number[][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('cluster map', () => {
  it('keeps the companies-on-top choice in the URL', () => {
    expect(defaultState()).toMatchObject({ onTop: false });
    const state = { ...defaultState(), clusters: true, onTop: true };
    const query = toQuery(state);
    expect(query).toContain('clusters=1');
    expect(query).toContain('ontop=1');
    expect(fromQuery(query)).toEqual(state);
    expect(toQuery({ ...state, onTop: false })).toBe('clusters=1');
    expect(fromQuery('clusters=1&ontop=yes').onTop).toBe(false);
  });

  it('counts members and upcoming events per cluster', () => {
    const entries = legendEntries(clusters.clusters, data.companies, events.events);
    expect(entries).toHaveLength(16);
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en-GB')));
    const by = new Map(entries.map((e) => [e.id, e]));
    expect(by.get('SCRDSC')).toMatchObject({ name: 'South Central', colour: '#8B1A3A', members: 3, events: 2 });
    expect(by.get('GLRDSC')).toMatchObject({ members: 0, events: 1 });
    expect(by.get('WalesDSC')).toMatchObject({ members: 0, events: 1 });
    expect(by.get('LRDSC')).toMatchObject({ members: null, events: 1 });
    expect(by.get('ScotlandDSC')).toMatchObject({ members: null, events: 0 });
  });

  it('draws smaller and chosen areas on top', () => {
    const rank = (chosen: string | null) => {
      const out = rankedRegions(regions.features, chosen);
      expect(out.features).toHaveLength(16);
      return new Map(out.features.map((f) => [f.properties.id, f.properties.rank]));
    };
    const plain = rank(null);
    expect(plain.get('GLRDSC')!).toBeGreaterThan(plain.get('EMRDSC')!);
    expect(plain.get('GLRDSC')!).toBeGreaterThan(plain.get('YRDSC')!);
    const chosen = rank('EMRDSC');
    for (const [id, r] of chosen) if (id !== 'EMRDSC') expect(chosen.get('EMRDSC')!).toBeGreaterThan(r);
    const out = rankedRegions(regions.features, 'EMRDSC');
    expect(out.features.find((f) => f.properties.id === 'EMRDSC')?.properties.chosen).toBe(true);
    expect(out.features.filter((f) => f.properties.chosen)).toHaveLength(1);
  });

  it('labels every cluster inside its area', () => {
    const labels = clusterLabels(regions.features, clusters.clusters);
    expect(labels.features).toHaveLength(16);
    const names = new Map(clusters.clusters.map((c) => [c.id, c.name]));
    for (const label of labels.features) {
      expect(label.geometry.type).toBe('Point');
      expect(label.properties.name).toBe(names.get(label.properties.id));
      const region = regions.features.find((f) => f.properties.id === label.properties.id)!;
      const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
      expect(polygons.some((p) => inside(label.geometry.coordinates, p[0])), label.properties.id).toBe(true);
    }
  });
});
