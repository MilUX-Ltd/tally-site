// Where a company is, as one line for a list: the town when it is on the map,
// and otherwise what is known and why it is not drawn.
import { isLocated } from './filters';
import type { Company } from './types';

const short = (text: string) => text.replace(/, (United Kingdom|UK|England)$/, '');

export function companyPlace(company: Company): string {
  if (isLocated(company)) return short(company.hq || company.region) || 'On the map';
  const overseas = Boolean(company.country) || company.region === 'Overseas';
  if (overseas) return `${company.hq || company.country || 'Overseas'} (overseas, not on the map)`;
  if (company.region) return `${company.region} (region only, not on the map)`;
  if (company.hq) return `${short(company.hq)} (not on the map)`;
  return 'No published location';
}
