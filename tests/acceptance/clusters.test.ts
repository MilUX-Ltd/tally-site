// Acceptance tests: cluster regions overlay and cluster events. Members-only
// events are signposts only. Committed failing before the build. Not edited
// after that commit.
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimClusters, slimData, slimEvents, SIGNPOST } from '../../scripts/fetch-data.mjs';
import { clusterMembers, type ClustersData, type EventsData } from '../../src/lib/clusters';
import { UK_BOUNDS } from '../../src/lib/map-config';
import type { TallyData } from '../../src/lib/types';
import { defaultState, fromQuery, sanitiseClusters, toQuery } from '../../src/lib/url-state';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data = slimData(read('../fixtures/tally-data.json'), read('../fixtures/taxonomy.json')) as TallyData;
const rawClusters = read('../fixtures/clusters.json');
const rawEvents = read('../fixtures/events.json');
const clusters = slimClusters(rawClusters) as ClustersData;
const BOUNDARIES = new URL('../../public/clusters/cluster-regions.geojson', import.meta.url);

const scWeb = 'https://www.southcentralrdsc.co.uk/';
const members = { audience: 'members', cluster: 'SCRDSC', date: '2099-03-18', text: SIGNPOST, link: scWeb };

describe('cluster events', () => {
  it('refuses members-only events that carry anything but the signpost', () => {
    expect(SIGNPOST).toBe("Members' event: join the cluster for details");
    const ok = slimEvents({ as_of: '2099-01-01', events: [members] }, clusters, '2099-01-01') as EventsData;
    expect(ok.events).toEqual([members]);
    for (const extra of [{ title: 'Secret' }, { summary: 'Secret' }, { where: 'Secret' }, { time: '10:00' }, { source: 'x' }, { id: 'i1' }]) {
      expect(() => slimEvents({ as_of: '2099-01-01', events: [{ ...members, ...extra }] }, clusters, '2099-01-01')).toThrow(/members-only/i);
    }
    expect(() => slimEvents({ as_of: '2099-01-01', events: [{ ...members, link: 'https://example.org/private' }] }, clusters, '2099-01-01')).toThrow(/members-only/i);
    expect(() => slimEvents({ as_of: '2099-01-01', events: [{ ...members, text: 'Secret dinner' }] }, clusters, '2099-01-01')).toThrow(/members-only/i);
    expect(() => slimEvents({ as_of: '2099-01-01', events: [{ ...members, cluster: 'NOPE' }] }, clusters, '2099-01-01')).toThrow();
    // A public event never carries fields outside the contract either.
    const pub = { audience: 'public', cluster: 'LRDSC', date: '2099-04-20', time: null, where: 'Online', title: 'T', summary: 'S', link: null };
    expect(() => slimEvents({ as_of: '2099-01-01', events: [{ ...pub, source: 'email' }] }, clusters, '2099-01-01')).toThrow();
    expect(() => slimEvents({ as_of: '2099-01-01', events: [{ ...pub, audience: 'other' }] }, clusters, '2099-01-01')).toThrow();
  });

  it('drops past events at build', () => {
    const out = slimEvents(rawEvents, clusters, '2026-11-19') as EventsData;
    expect(out.events.map((e) => e.date)).toEqual(['2099-03-10', '2099-03-18', '2099-04-02', '2099-04-20', '2099-04-20']);
    expect(JSON.stringify(out)).not.toContain('Fixture past showcase');
    const later = slimEvents(rawEvents, clusters, '2099-04-02') as EventsData;
    expect(later.events.map((e) => e.date)).toEqual(['2099-04-02', '2099-04-20', '2099-04-20']);
    // Unsafe links on public events are dropped.
    const unsafe = slimEvents(
      { as_of: '2099-01-01', events: [{ audience: 'public', cluster: 'LRDSC', date: '2099-04-20', time: null, where: null, title: 'T', summary: null, link: 'javascript:alert(1)' }] },
      clusters,
      '2099-01-01',
    ) as EventsData;
    expect(unsafe.events[0]).toMatchObject({ link: null });
  });
});

describe('cluster regions', () => {
  it('keeps the cluster overlay and choice in the URL', () => {
    expect(defaultState()).toMatchObject({ clusters: false, cluster: null });
    const state = { ...defaultState(), clusters: true, cluster: 'SCRDSC' };
    const query = toQuery(state);
    expect(query).toContain('clusters=1');
    expect(query).toContain('cluster=SCRDSC');
    expect(fromQuery(query)).toEqual(state);
    expect(toQuery({ ...state, clusters: false })).toBe('cluster=SCRDSC');
    expect(toQuery(defaultState())).toBe('');
    expect(fromQuery('cluster=<script>').cluster).toBeNull();
    expect(fromQuery('clusters=yes').clusters).toBe(false);
    const ids = clusters.clusters.map((c) => c.id);
    expect(sanitiseClusters(fromQuery('cluster=WalesDSC'), ids).cluster).toBe('WalesDSC');
    expect(sanitiseClusters(fromQuery('cluster=NoSuchCluster&clusters=1'), ids)).toMatchObject({ cluster: null, clusters: true });
  });

  it('every cluster has a boundary in its colour', () => {
    expect(statSync(BOUNDARIES).size).toBeLessThan(150_000);
    const geo = JSON.parse(readFileSync(BOUNDARIES, 'utf8'));
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.source).toMatch(/Office for National Statistics/);
    expect(geo.licence).toBe('Open Government Licence v3.0');
    expect(geo.attribution).toMatch(/Office for National Statistics/);
    expect(geo.attribution).toMatch(/Crown copyright/);
    expect(clusters.clusters).toHaveLength(16);
    const byId = new Map(geo.features.map((f: { properties: { id: string } }) => [f.properties.id, f]));
    expect(byId.size).toBe(16);
    const [w, s, e, n] = UK_BOUNDS;
    for (const cluster of clusters.clusters) {
      const f = byId.get(cluster.id) as { properties: { colour: string; lon: number; lat: number }; geometry: { type: string; coordinates: unknown } };
      expect(f, cluster.id).toBeTruthy();
      expect(f.properties.colour).toBe(cluster.colour);
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type);
      const points = (f.geometry.coordinates as unknown[]).flat(f.geometry.type === 'Polygon' ? 1 : 2) as number[][];
      expect(points.length).toBeGreaterThan(3);
      for (const [lon, lat] of points) {
        expect(lon).toBeGreaterThanOrEqual(w);
        expect(lon).toBeLessThanOrEqual(e);
        expect(lat).toBeGreaterThanOrEqual(s);
        expect(lat).toBeLessThanOrEqual(n);
      }
      expect(f.properties.lon).toBeGreaterThanOrEqual(w);
      expect(f.properties.lat).toBeLessThanOrEqual(n);
    }
  });

  it('filters companies to a cluster\'s members', () => {
    const sc = clusters.clusters.find((c) => c.id === 'SCRDSC');
    expect(sc?.membership).toBe('mbr-scrdsc');
    const names = clusterMembers(data.companies, sc!)?.map((c) => c.name).sort();
    expect(names).toEqual(['Example EW Systems', 'Example Harbour Systems', 'Example Human Factors']);
    const london = clusters.clusters.find((c) => c.id === 'LRDSC');
    expect(london?.membership).toBeNull();
    expect(clusterMembers(data.companies, london!)).toBeNull();
  });
});
