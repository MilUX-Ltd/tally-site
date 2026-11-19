// Regional defence and security clusters and their upcoming events, built
// from the data repo (scripts/fetch-data.mjs). Members-only events are
// signposts only: cluster, date, fixed text and the cluster's own website.
import type { Company } from './types';

export interface Cluster {
  id: string;
  name: string;
  full: string;
  region: string;
  regions: Array<{ code: string; name: string }>;
  status: 'live' | 'pre-launch' | 'proposed';
  web: string | null;
  linkedin: string | null;
  colour: string;
  /** The membership tag (mbr-...) Tally records for this cluster's members, if any. */
  membership: string | null;
}

export interface ClustersData {
  as_of: string;
  clusters: Cluster[];
}

export interface PublicEvent {
  audience: 'public';
  cluster: string;
  date: string;
  time: string | null;
  where: string | null;
  title: string;
  summary: string | null;
  link: string | null;
}

export interface MembersEvent {
  audience: 'members';
  cluster: string;
  date: string;
  text: string;
  link: string;
}

export type ClusterEvent = PublicEvent | MembersEvent;

export interface EventsData {
  as_of: string;
  events: ClusterEvent[];
}

export interface RegionFeature {
  type: 'Feature';
  properties: { id: string; name: string; colour: string; lon: number; lat: number };
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface RegionsData {
  type: 'FeatureCollection';
  attribution: string;
  licence: string;
  licence_url: string;
  features: RegionFeature[];
}

export const STATUS_LABELS: Record<Cluster['status'], string> = {
  live: 'Live',
  'pre-launch': 'Launching soon',
  proposed: 'Proposed',
};

/** Companies Tally records as members of a cluster, or null when it records none for that cluster. */
export function clusterMembers(companies: Company[], cluster: Cluster): Company[] | null {
  if (!cluster.membership) return null;
  const tag = cluster.membership;
  return companies.filter((c) => c.tags.includes(tag));
}

/** Today's date as YYYY-MM-DD in the viewer's time zone. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function upcoming(events: ClusterEvent[], from: string): ClusterEvent[] {
  return events.filter((e) => e.date >= from);
}

/** One marker per cluster with upcoming events, at its region's label point. */
export function eventMarkers(events: ClusterEvent[], regions: RegionFeature[], clusters: Cluster[]) {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.cluster, (counts.get(e.cluster) ?? 0) + 1);
  const names = new Map(clusters.map((c) => [c.id, c.name]));
  return {
    type: 'FeatureCollection' as const,
    features: regions
      .filter((f) => counts.has(f.properties.id))
      .map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.properties.lon, f.properties.lat] },
        properties: { id: f.properties.id, name: names.get(f.properties.id) ?? f.properties.name, colour: f.properties.colour, count: counts.get(f.properties.id) ?? 0 },
      })),
  };
}

/** West, south, east, north of a region outline. */
export function regionBounds(feature: RegionFeature): [number, number, number, number] {
  const points = (feature.geometry.type === 'Polygon' ? feature.geometry.coordinates.flat() : feature.geometry.coordinates.flat(2)) as number[][];
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/** Long date, for example "Tuesday 10 March 2099". Dates are calendar days, read in UTC. */
export function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}
