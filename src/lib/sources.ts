// The data sources and licences Tally names, for the about page: the UK's
// always, and each other country's once it is live. One list, so the page
// never names a source for a country that is not shown, or misses one that is.
import type { Country } from './scope';

export interface DataSource {
  name: string;
  /** What Tally takes from it. */
  use: string;
  licence: string;
  url: string;
  /** The country it serves; absent for a source used everywhere. */
  country?: string;
}

const SOURCES: DataSource[] = [
  { name: 'Companies House', use: 'Company status and the defence companies formed and dissolved each year', licence: 'Open Government Licence v3.0', url: 'https://find-and-update.company-information.service.gov.uk/', country: 'GB' },
  { name: 'postcodes.io', use: 'Places typed into Near, and postcodes placed on the map', licence: 'Open Government Licence v3.0', url: 'https://postcodes.io', country: 'GB' },
  { name: 'Office for National Statistics', use: 'Region and cluster boundaries', licence: 'Open Government Licence v3.0', url: 'https://geoportal.statistics.gov.uk/', country: 'GB' },
  { name: 'Brønnøysund Register Centre', use: 'Norwegian company status and registered business address', licence: 'NLOD 2.0', url: 'https://data.brreg.no/', country: 'NO' },
  { name: 'GeoNames', use: 'Norwegian postcodes placed on the map', licence: 'CC BY 4.0', url: 'https://www.geonames.org/', country: 'NO' },
  { name: 'Natural Earth', use: 'Country outlines on company pages outside the UK', licence: 'Public domain', url: 'https://www.naturalearthdata.com/' },
  { name: 'OpenStreetMap', use: 'The map', licence: 'ODbL', url: 'https://www.openstreetmap.org/copyright' },
];

/** The sources for the live countries: the UK's and the shared ones always; another country's only once it is live. Natural Earth only when a country beyond the UK is live. */
export function dataSources(countries: Country[]): DataSource[] {
  const live = new Set(countries.filter((c) => c.live).map((c) => c.code));
  live.add('GB');
  const abroad = [...live].some((c) => c !== 'GB');
  return SOURCES.filter((s) => (s.country ? live.has(s.country) : s.name !== 'Natural Earth' || abroad));
}
