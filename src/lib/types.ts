// Shapes of the data the browser receives from the build (scripts/fetch-data.mjs).

export interface Company {
  id: string;
  name: string;
  website: string;
  linkedin: string;
  hq: string;
  region: string;
  size: string;
  headcount: string;
  founded: string;
  tags: string[];
  summary: string;
  lat: number | null;
  lon: number | null;
  postcode: string;
  location_source: string;
  country: string;
}

export interface Group {
  slug: string;
  label: string;
  order: number;
  description: string;
}

export interface Capability {
  slug: string;
  label: string;
  group: string;
}

export interface Option {
  slug: string;
  label: string;
}

export interface Taxonomy {
  groups: Group[];
  capabilities: Capability[];
  sizes: Option[];
  regions: Option[];
  frameworks: Option[];
  accreditations: Option[];
  memberships: Option[];
}

export interface TallyData {
  generated: string;
  count: number;
  taxonomy: Taxonomy;
  companies: Company[];
}
