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

/**
 * The cluster map's own palette, used only on the map and its legend. The
 * house colours in clusters.json are kept as data, but several are
 * near-identical navies, so the map needs colours that can be told apart.
 * From Paul Tol's colourblind-safe muted and vibrant sets, assigned so that
 * neighbouring and overlapping areas stay distinct under simulated
 * deuteranopia, protanopia and tritanopia.
 */
export const MAP_COLOURS: Record<string, string> = {
  SWRDSC: '#999933',
  WRDSC: '#88CCEE',
  SCRDSC: '#EE3377',
  OBCRDSC: '#332288',
  LRDSC: '#994F00',
  ERDSC: '#44AA99',
  WalesDSC: '#AA4499',
  WMRDSC: '#117733',
  EMRDSC: '#882255',
  GLRDSC: '#EE7733',
  YRDSC: '#0077BB',
  NWRDSC: '#DDCC77',
  NERDSC: '#CC6677',
};

/** Clusters that are not yet live are drawn as an outline only, in this colour. */
export const NOT_LIVE_COLOUR = '#5B6770';

/** A cluster's colour on the map: its palette colour, or the house colour for a cluster the palette does not know yet. */
export function mapColour(cluster: Pick<Cluster, 'id' | 'colour' | 'status'>): string {
  if (cluster.status !== 'live') return NOT_LIVE_COLOUR;
  return MAP_COLOURS[cluster.id] ?? cluster.colour;
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
  const colours = new Map(clusters.map((c) => [c.id, mapColour(c)]));
  return {
    type: 'FeatureCollection' as const,
    features: regions
      .filter((f) => counts.has(f.properties.id))
      .map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.properties.lon, f.properties.lat] },
        properties: { id: f.properties.id, name: names.get(f.properties.id) ?? f.properties.name, colour: f.properties.colour, mapColour: colours.get(f.properties.id) ?? f.properties.colour, count: counts.get(f.properties.id) ?? 0 },
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

// The cluster map: every cluster's area on one map, labelled, with a legend.

export interface LegendEntry {
  id: string;
  name: string;
  colour: string;
  /** The colour this cluster is drawn in on the cluster map. */
  mapColour: string;
  status: Cluster['status'];
  /** Companies Tally records as members, or null when it records none for this cluster. */
  members: number | null;
  /** Upcoming events. */
  events: number;
}

/** One legend entry per cluster, sorted by name: members and upcoming events. */
export function legendEntries(clusters: Cluster[], companies: Company[], events: ClusterEvent[]): LegendEntry[] {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.cluster, (counts.get(e.cluster) ?? 0) + 1);
  return [...clusters]
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))
    .map((c) => ({
      id: c.id,
      name: c.name,
      colour: c.colour,
      mapColour: mapColour(c),
      status: c.status,
      members: clusterMembers(companies, c)?.length ?? null,
      events: counts.get(c.id) ?? 0,
    }));
}

const polygonsOf = (f: RegionFeature): number[][][][] => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);

/** Area of a region's outer rings, in square degrees (enough to compare regions). */
export function regionArea(feature: RegionFeature): number {
  let total = 0;
  for (const [ring] of polygonsOf(feature)) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    total += Math.abs(a / 2);
  }
  return total;
}

export interface RankedRegion extends RegionFeature {
  properties: RegionFeature['properties'] & { chosen: boolean; rank: number; mapColour: string; live: boolean };
}

/**
 * Regions with a drawing rank: smaller areas rank higher, so an area that
 * lies over larger ones (Greater Lincolnshire over East Midlands and
 * Yorkshire) stays legible; the chosen cluster ranks above all.
 */
export function rankedRegions(features: RegionFeature[], chosen: string | null, clusters: Cluster[] = []): { type: 'FeatureCollection'; features: RankedRegion[] } {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const bySize = [...features].sort((a, b) => regionArea(b) - regionArea(a));
  const rank = new Map(bySize.map((f, i) => [f.properties.id, i + 1]));
  return {
    type: 'FeatureCollection',
    features: features.map((f) => {
      const isChosen = f.properties.id === chosen;
      const c = byId.get(f.properties.id);
      const style = { mapColour: c ? mapColour(c) : f.properties.colour, live: c ? c.status === 'live' : true };
      return { ...f, properties: { ...f.properties, ...style, chosen: isChosen, rank: isChosen ? features.length + 1 : (rank.get(f.properties.id) ?? 0) } };
    }),
  };
}

/** One name label per cluster, at its region's label point (inside its largest part). */
export function clusterLabels(features: RegionFeature[], clusters: Cluster[]) {
  const names = new Map(clusters.map((c) => [c.id, c.name]));
  return {
    type: 'FeatureCollection' as const,
    features: features.map((f) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [f.properties.lon, f.properties.lat] },
      properties: { id: f.properties.id, name: names.get(f.properties.id) ?? f.properties.name },
    })),
  };
}
