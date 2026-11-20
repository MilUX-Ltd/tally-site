// The results panel: the count, the companies a page at a time (nearest first
// with distances when a place is set), and paging. Beside the map it is the
// card on the left (a bottom sheet on a phone); in the List view it is the
// whole width and also holds the matrix and the overseas companies. With the
// map, it is the accessible route to everything the map shows. The same panel
// shows a chosen map area and the shortlist.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { companyPath } from '../lib/company-page';
import { companyPlace } from '../lib/place';
import type { Company } from '../lib/types';

export const PAGE_SIZE = 20;

export interface Hit {
  company: Company;
  /** Miles from the chosen place or site, when one is set and the company is on the map. */
  miles: number | null;
}

interface Props {
  kind: 'results' | 'area' | 'shortlist';
  hits: Hit[];
  page: number;
  onPage: (page: number) => void;
  /** Capability labels by slug, for the tags on each row. */
  labels: Map<string, string>;
  shortlisted: (id: string) => boolean;
  onShortlist: (company: Company, add: boolean) => void;
  /** The line under the count: where the companies are and how they are ordered. */
  sub: string;
  /** Still loading the data: placeholder rows. */
  loading: boolean;
  /** Shown in place of the rows when there are none. */
  empty: ComponentChildren;
  /** The links at the top right: Start again, Clear the area, Back to results. */
  actions: ComponentChildren;
  /** Under the heading: the shortlist's share tools. */
  tools?: ComponentChildren;
  /** After the rows, in the List view: the matrix and the overseas companies. */
  children?: ComponentChildren;
  /** Goes up by one when the heading should take focus (a map pick, the shortlist opening). */
  focus: number;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

function Row({ hit, labels, on, onShortlist, remove }: { hit: Hit; on: boolean; remove: boolean } & Pick<Props, 'labels' | 'onShortlist'>) {
  const { company: c, miles } = hit;
  const tags = c.tags.filter((t) => labels.has(t) && !t.includes('/')).slice(0, 3);
  return (
    <li class="row">
      <h3>
        <a href={companyPath(c.id)}>{c.name}</a>
      </h3>
      {on ? (
        <button type="button" class={remove ? 'btn btn-sm add' : 'btn btn-sm add is-selected'} onClick={() => onShortlist(c, false)}>
          {remove ? (
            <span>
              Remove<span class="vh"> {c.name} from shortlist</span>
            </span>
          ) : (
            <span>
              <span aria-hidden="true">✓ </span>Shortlisted<span class="vh">. Remove {c.name} from shortlist</span>
            </span>
          )}
        </button>
      ) : (
        <button type="button" class="btn btn-sm add" onClick={() => onShortlist(c, true)}>
          <span>
            <span aria-hidden="true">+ </span>
            <span class="vh">Add {c.name} to </span>Shortlist
          </span>
        </button>
      )}
      <span class="place">
        {miles !== null && <b class="dist">{Math.round(miles)} mi</b>}
        {companyPlace(c)}
      </span>
      {c.summary && <p>{c.summary}</p>}
      {tags.length > 0 && (
        <div class="tags">
          {tags.map((t) => (
            <span key={t} class="tag">
              {labels.get(t)}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export default function ResultsPanel(p: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const n = p.hits.length;
  const pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
  const current = Math.min(Math.max(1, p.page), pages);
  const from = (current - 1) * PAGE_SIZE;
  const shown = p.hits.slice(from, from + PAGE_SIZE);
  useEffect(() => {
    if (p.focus > 0) heading.current?.focus();
  }, [p.focus]);
  useEffect(() => {
    if (rows.current) rows.current.scrollTop = 0;
  }, [current, p.kind]);
  const title = p.loading ? 'Loading companies' : p.kind === 'shortlist' ? `Shortlist: ${n}` : p.kind === 'area' ? `${count(n, 'company', 'companies')} in this area` : count(n, 'company', 'companies');
  return (
    <section class="panel" aria-label={p.kind === 'shortlist' ? 'Shortlist' : p.kind === 'area' ? 'Companies in this area' : 'Results'}>
      <header class="panel-head">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <p>{p.sub}</p>
        </div>
        <div class="panel-actions">{p.actions}</div>
      </header>
      {p.tools}
      <div class="panel-body" ref={rows}>
        {p.loading ? (
          <ul class="rows" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} class="row skeleton">
                <span />
                <span />
                <span />
              </li>
            ))}
          </ul>
        ) : n === 0 ? (
          <div class="empty">{p.empty}</div>
        ) : (
          <ul class={p.kind === 'area' ? 'rows results area' : 'rows results'} aria-label="Results">
            {shown.map((hit) => (
              <Row key={hit.company.id} hit={hit} labels={p.labels} on={p.shortlisted(hit.company.id)} remove={p.kind === 'shortlist'} onShortlist={p.onShortlist} />
            ))}
          </ul>
        )}
        {p.children}
      </div>
      {n > 0 && (
        <footer class="panel-foot">
          <span>
            {from + 1} to {from + shown.length} of {n.toLocaleString('en-GB')}
            {pages > 1 && (
              <span class="vh">
                , page {current} of {pages}
              </span>
            )}
          </span>
          {pages > 1 && (
            <nav class="pager" aria-label="Results pages">
              <button type="button" class="link" disabled={current === 1} onClick={() => p.onPage(current - 1)}>
                <span aria-hidden="true">← </span>Previous<span class="vh"> page</span>
              </button>
              <button type="button" class="link" disabled={current === pages} onClick={() => p.onPage(current + 1)}>
                Next<span class="vh"> page</span>
                <span aria-hidden="true"> →</span>
              </button>
            </nav>
          )}
        </footer>
      )}
    </section>
  );
}
