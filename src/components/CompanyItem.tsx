// One company in a list.
import type { ComponentChildren } from 'preact';
import { isLocated } from '../lib/filters';
import type { Company } from '../lib/types';

export default function CompanyItem({ company, headingLevel = 3, children }: { company: Company; headingLevel?: 3 | 4; children?: ComponentChildren }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const place = company.hq || (company.country ? company.country : 'Location not known');
  return (
    <li class="company">
      <Heading>{company.name}</Heading>
      <p class="meta">
        {place}
        {!isLocated(company) && <span> (not on the map)</span>}
      </p>
      {company.summary && <p>{company.summary}</p>}
      <p class="company-actions">
        {company.website && (
          <a href={company.website} rel="noopener noreferrer">
            Website<span class="vh"> of {company.name}</span>
          </a>
        )}
        {children}
      </p>
    </li>
  );
}
