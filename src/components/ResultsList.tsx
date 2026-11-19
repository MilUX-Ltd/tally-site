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

/** Previous and next buttons for a paged list; nothing when there is one page. */
export function Pager({ label, current, pages, onPage }: { label: string; current: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav class="pager" aria-label={label}>
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
  );
}

/** The companies on one page of a list, with the page clamped to those that exist. */
export function pageOf<T>(items: T[], page: number): { shown: T[]; current: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return { shown: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), current, pages };
}

export default function ResultsList({ companies, page, onPage, actions }: Props) {
  const { shown, current, pages } = pageOf(companies, page);
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
      <Pager label="Results pages" current={current} pages={pages} onPage={onPage} />
    </section>
  );
}
