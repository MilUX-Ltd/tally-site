// Defence sites and distance rings. The sites are a committed, verified
// dataset (public/sites/defence-sites.json); each names its source. Distances
// are great-circle, in miles.
import { isLocated } from './filters';
import type { Country } from './scope';
import type { Company } from './types';

export interface SiteSource {
  name: string;
  title: string;
  url: string;
  revision: number;
  licence: string;
  licence_url: string;
  retrieved: string;
}

export interface Site {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  source: SiteSource;
  verification: { status: string; method: string; distance_km: number };
}

export interface SitesData {
  title: string;
  version: string;
  attribution: string;
  licence: string;
  method: string;
  sites: Site[];
}

export const RADII = [10, 25, 50] as const;
export type Radius = (typeof RADII)[number];
export const DEFAULT_RADIUS: Radius = 25;

export const KIND_LABELS: Record<string, string> = {
  'air-station': 'Air stations',
  base: 'Bases and garrisons',
  hq: 'Headquarters',
  'naval-base': 'Naval bases',
  range: 'Ranges',
  'training-area': 'Training areas',
};

const EARTH_RADIUS_MILES = 3958.7613;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance between two points, in miles. */
export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Located companies within a radius (miles) of a site or place, in input
 * order. Only companies drawn in the countries in view count (the UK by
 * default); overseas companies in a country not in view never do.
 */
export function companiesNearSite(companies: Company[], site: Pick<Site, 'lat' | 'lon'>, miles: number, countries?: Country[]): Company[] {
  return companies.filter((c) => isLocated(c, countries) && distanceMiles(site.lat, site.lon, c.lat, c.lon) <= miles);
}

/** A closed ring of [lon, lat] points at a distance (miles) around a site. */
export function ringPolygon(site: Pick<Site, 'lat' | 'lon'>, miles: number, steps = 96): number[][] {
  const d = miles / EARTH_RADIUS_MILES;
  const lat1 = rad(site.lat);
  const lon1 = rad(site.lon);
  const ring: number[][] = [];
  for (let i = 0; i < steps; i++) {
    const b = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([Number(deg(lon2).toFixed(5)), Number(deg(lat2).toFixed(5))]);
  }
  ring.push([...ring[0]]);
  return ring;
}

export function isRadius(n: number): n is Radius {
  return (RADII as readonly number[]).includes(n);
}
