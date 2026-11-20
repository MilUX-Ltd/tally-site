// The cluster atlas: a flat map of every cluster region drawn as SVG at build
// time, from public/clusters/cluster-regions.geojson. Plain geometry with no
// framework imports: a projection, one outline path per region, the pin for a
// cluster's upcoming events and where each cluster's name sits beside the map.
import { MAP_LABEL_POINTS, type RegionFeature } from './clusters';

/** Outline units per degree of latitude; paths are whole numbers at this scale. */
export const ATLAS_UNIT = 200;
/** East-west squeeze at the middle latitude of the UK, so shapes keep their proportions. */
const SQUEEZE = Math.cos((54.5 * Math.PI) / 180);

export interface AtlasFrame {
  west: number;
  north: number;
  /** Size of the whole map in outline units. */
  width: number;
  height: number;
}

const ringsOf = (f: RegionFeature): number[][][] => (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat());

/** The frame that holds every region. */
export function atlasFrame(features: RegionFeature[]): AtlasFrame {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const f of features) {
    for (const ring of ringsOf(f)) {
      for (const [lon, lat] of ring) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  return { west, north, width: (east - west) * SQUEEZE * ATLAS_UNIT, height: (north - south) * ATLAS_UNIT };
}

/** A longitude and latitude in outline units, from the frame's top left. */
export function project(frame: AtlasFrame, lon: number, lat: number): [number, number] {
  return [(lon - frame.west) * SQUEEZE * ATLAS_UNIT, (frame.north - lat) * ATLAS_UNIT];
}

/** A region's outline as SVG path data in outline units: whole numbers, relative moves. */
export function regionPath(frame: AtlasFrame, feature: RegionFeature): string {
  let d = '';
  for (const ring of ringsOf(feature)) {
    let px = 0;
    let py = 0;
    let started = false;
    for (const [lon, lat] of ring) {
      const [fx, fy] = project(frame, lon, lat);
      const x = Math.round(fx);
      const y = Math.round(fy);
      if (!started) {
        d += `M${x} ${y}`;
        started = true;
      } else if (x !== px || y !== py) {
        d += `l${x - px} ${y - py}`;
      } else {
        continue;
      }
      px = x;
      py = y;
    }
    d += 'z';
  }
  return d;
}

/** A region's box in outline units: x, y, width, height. */
export function regionBox(frame: AtlasFrame, feature: RegionFeature): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of ringsOf(feature)) {
    for (const [lon, lat] of ring) {
      const [x, y] = project(frame, lon, lat);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return [Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0), Math.ceil(y1 - y0)];
}

/** Where a cluster's pin and label line meet its region, in outline units. */
export function labelPoint(frame: AtlasFrame, feature: RegionFeature): [number, number] {
  const [lon, lat] = MAP_LABEL_POINTS[feature.properties.id] ?? [feature.properties.lon, feature.properties.lat];
  return project(frame, lon, lat);
}

/**
 * Which side of the map a cluster's name sits on. Great Britain leans to the
 * west as it runs north, so the dividing line leans with it.
 */
export function labelSide(lon: number, lat: number): 'left' | 'right' {
  return lon < -2 - (lat - 52) * 0.25 ? 'left' : 'right';
}

/**
 * Spread labels down one side so none overlap: each as close to its own
 * point's height as the gap allows, kept between top and bottom.
 */
export function spreadLabels<T extends { y: number }>(items: T[], top: number, bottom: number, gap: number): Array<T & { labelY: number }> {
  const sorted = [...items].sort((a, b) => a.y - b.y).map((item) => ({ ...item, labelY: Math.min(Math.max(item.y, top), bottom) }));
  for (let i = 1; i < sorted.length; i++) sorted[i].labelY = Math.max(sorted[i].labelY, sorted[i - 1].labelY + gap);
  const last = sorted.length - 1;
  if (last >= 0 && sorted[last].labelY > bottom) {
    sorted[last].labelY = bottom;
    for (let i = last - 1; i >= 0; i--) sorted[i].labelY = Math.min(sorted[i].labelY, sorted[i + 1].labelY - gap);
  }
  return sorted;
}

/**
 * The step of the data ramp (1 to 4) for a count of upcoming events, or 0 for
 * none. Steps are whole numbers of events wide, sized to the busiest cluster.
 */
export function rampStep(count: number, most: number): number {
  if (count <= 0) return 0;
  return Math.min(4, Math.ceil(count / rampStepSize(most)));
}

export function rampStepSize(most: number): number {
  return Math.max(1, Math.ceil(most / 4));
}

/** The legend's label for a step of the ramp: "1", or "3 to 4" when a step covers more than one count. */
export function rampLabel(step: number, most: number): string {
  const size = rampStepSize(most);
  return size === 1 ? String(step) : `${(step - 1) * size + 1} to ${step * size}`;
}

/** A cluster's short code for a small map: its id without the "regional defence and security cluster" letters. */
export function shortCode(id: string): string {
  return id.replace(/R?DSC$/, '').toUpperCase();
}

/** Graticule: whole degrees of longitude and latitude inside the frame, every `every` degrees. */
export function graticule(frame: AtlasFrame, every: number): { lons: number[]; lats: number[] } {
  const east = frame.west + frame.width / (SQUEEZE * ATLAS_UNIT);
  const south = frame.north - frame.height / ATLAS_UNIT;
  const range = (from: number, to: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(from / every) * every; v <= to; v += every) out.push(v);
    return out;
  };
  return { lons: range(frame.west - 6, east + 6), lats: range(south - 1, frame.north + 1) };
}

/** Kilometres per outline unit, north to south. */
export const KM_PER_UNIT = 111.2 / ATLAS_UNIT;
