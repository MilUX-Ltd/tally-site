// One company in a list.
import type { ComponentChildren } from 'preact';
import { companyPath } from '../lib/company-page';
import { companyPlace } from '../lib/place';
import type { Company } from '../lib/types';

export default function CompanyItem({ company, headingLevel = 3, children }: { company: Company; headingLevel?: 3 | 4 | 5; children?: ComponentChildren }) {
  const Heading = (['h3', 'h4', 'h5'] as const)[headingLevel - 3];
  const place = companyPlace(company);
  return (
    <li class="company">
      <Heading>
        <a href={companyPath(company.id)}>{company.name}</a>
      </Heading>
      <p class="meta">{place}</p>
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
