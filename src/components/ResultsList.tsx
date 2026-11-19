// The list of companies matching the filters, a page at a time. With the
// matrix, this is the accessible route to everything the map shows.
import type { ComponentChildren } from 'preact';
import CompanyItem from './CompanyItem';
import type { Company } from '../lib/types';

export const PAGE_SIZE = 20;

interface Props {
  companies: Company[];
  page: number;
  onPage: (page: number) => void;
  actions?: (company: Company) => ComponentChildren;
}

export default function ResultsList({ companies, page, onPage, actions }: Props) {
  const pages = Math.max(1, Math.ceil(companies.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const shown = companies.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <section class="results" aria-labelledby="results-heading">
      <h2 id="results-heading">Companies</h2>
      {companies.length === 0 ? (
        <p>No companies match these filters. Try removing one.</p>
      ) : (
        <ul aria-label="Results" class="company-list">
          {shown.map((c) => (
            <CompanyItem key={c.id} company={c}>
              {actions?.(c)}
            </CompanyItem>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav class="pager" aria-label="Results pages">
          <button type="button" class="secondary" disabled={current === 1} onClick={() => onPage(current - 1)}>
            Previous<span class="vh"> page</span>
          </button>
          <span>
            Page {current} of {pages}
          </span>
          <button type="button" class="secondary" disabled={current === pages} onClick={() => onPage(current + 1)}>
            Next<span class="vh"> page</span>
          </button>
        </nav>
      )}
    </section>
  );
}
