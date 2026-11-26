// The Matrix view: a real table of companies against capabilities, grouped
// by capability group, the whole width of the page. Ticking a column sets the
// capability filter (the map redraws behind it); an area on the map narrows
// the rows; with the shortlist open it compares the shortlist. The card
// scrolls as one: the heading and the group choices scroll away, then the
// header rows and the company column stay in place.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { companyPath } from '../lib/company-page';
import { hasCapability, matrixColumns, matrixPage, MATRIX_PAGE_SIZE } from '../lib/matrix';
import type { Company, Taxonomy } from '../lib/types';

interface Props {
  taxonomy: Taxonomy;
  companies: Company[];
  selectedCaps: string[];
  group: string | null;
  page: number;
  /** Which companies are compared: the results, a map area or the shortlist. */
  scope: 'results' | 'area' | 'shortlist';
  shortlisted: (id: string) => boolean;
  onShortlist: (company: Company, add: boolean) => void;
  onToggleCap: (slug: string, on: boolean) => void;
  onGroup: (group: string | null) => void;
  onPage: (page: number) => void;
  /** The links at the top right: Start again, Clear the area, Back to results. */
  actions: ComponentChildren;
  /** Under the heading: the shortlist's share tools. */
  tools?: ComponentChildren;
  /** Shown in place of the table when there is no company to compare. */
  empty: ComponentChildren;
  /** Goes up by one when the heading should take focus (the view switch, the shortlist opening). */
  focus: number;
  /** Across several countries: each company's country, shown in its own column. */
  countryOf?: ((company: Company) => string) | null;
}

const classes = (...names: Array<string | false>) => names.filter(Boolean).join(' ') || undefined;

export default function Matrix({ taxonomy, companies, selectedCaps, group, page, scope: which, shortlisted, onShortlist, onToggleCap, onGroup, onPage, actions, tools, empty, focus, countryOf }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => matrixColumns(taxonomy, group), [taxonomy, group]);
  // Each column, and whether it is the first of its group (a heavier rule).
  const columns = groups.flatMap((g) => g.columns.map((c, i) => ({ ...c, start: i === 0, on: selectedCaps.includes(c.slug) })));
  const { rows, page: current, pages } = matrixPage(companies, page);
  const first = (current - 1) * MATRIX_PAGE_SIZE + 1;
  const scope = which === 'area' ? ' in the selected area' : which === 'shortlist' ? ' on your shortlist' : '';
  useEffect(() => {
    if (focus > 0) heading.current?.focus();
  }, [focus]);
  // A new page of rows starts at its first row, under the header rows.
  useEffect(() => {
    const el = scroller.current;
    const table = el?.querySelector('table');
    if (el && table) el.scrollTop = Math.min(el.scrollTop, table.offsetTop);
  }, [current]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [which]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, [group]);
  const options = [{ slug: '', label: 'All groups' }, ...[...taxonomy.groups].sort((a, b) => a.order - b.order)];
  return (
    <section class="matrix" aria-labelledby="matrix-heading">
      <div class="matrix-scroll" ref={scroller} tabIndex={0} role="region" aria-label="Compare capabilities table, scrolls both ways">
        <header class="panel-head">
          <div>
            <h2 id="matrix-heading" ref={heading} tabIndex={-1}>
              Compare capabilities
            </h2>
            <p>
              {companies.length === 1 ? '1 company' : `${companies.length.toLocaleString('en-GB')} companies`}
              {scope}. Tick a capability to show only the companies that offer it.
            </p>
          </div>
          <div class="panel-actions">{actions}</div>
        </header>
        {tools}
        <div class="matrix-groups" role="radiogroup" aria-labelledby="matrix-groups-label">
          <span id="matrix-groups-label" class="mono">
            Capabilities shown
          </span>
          <div class="matrix-picks">
            {options.map((g) => (
              <label key={g.slug} class="matrix-pick">
                <input type="radio" name="matrix-group" value={g.slug} checked={(group ?? '') === g.slug} onChange={() => onGroup(g.slug || null)} />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
        </div>
        {companies.length === 0 ? (
          <div class="empty">{empty}</div>
        ) : (
          <table>
            <caption class="vh">Compare capabilities: companies by capability</caption>
            <colgroup span={countryOf ? 3 : 2} />
            {groups.map((g) => (
              <colgroup key={g.group.slug} span={g.columns.length} />
            ))}
            <thead>
              <tr>
                <td class="corner" colSpan={countryOf ? 3 : 2}>
                  <span class="matrix-key">
                    <span class="mark" aria-hidden="true" /> Offers the capability
                  </span>
                </td>
                {groups.map((g) => (
                  <th key={g.group.slug} scope="colgroup" colSpan={g.columns.length} class="group-head">
                    {g.group.label}
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="col" class="company-head">
                  Company
                </th>
                {countryOf && (
                  <th scope="col" class="country-head">
                    Country
                  </th>
                )}
                <th scope="col" class="list-head">
                  <span class="vh">Shortlist</span>
                </th>
                {columns.map((c) => (
                  <th key={c.slug} scope="col" class={classes('cap-head', c.start && 'start', c.on && 'on')}>
                    <label>
                      <input type="checkbox" checked={c.on} onChange={(e) => onToggleCap(c.slug, (e.currentTarget as HTMLInputElement).checked)} />
                      <span class="vh">Filter by </span>
                      <span class="cap-label">{c.label}</span>
                    </label>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((company) => {
                const listed = shortlisted(company.id);
                return (
                  <tr key={company.id}>
                    <th scope="row">
                      <a href={companyPath(company.id)}>{company.name}</a>
                    </th>
                    {countryOf && <td class="country-cell">{countryOf(company)}</td>}
                    <td class="list-cell">
                      <button type="button" class={listed ? 'matrix-add is-selected' : 'matrix-add'} onClick={() => onShortlist(company, !listed)}>
                        <span aria-hidden="true">{listed ? '✓' : '+'}</span>
                        <span class="vh">{listed ? `Remove ${company.name} from shortlist` : `Add ${company.name} to shortlist`}</span>
                      </button>
                    </td>
                    {columns.map((c) =>
                      hasCapability(company, c.slug) ? (
                        <td key={c.slug} class={classes('tick', c.start && 'start', c.on && 'on')}>
                          <span class="mark" aria-hidden="true" />
                          <span class="vh">Yes</span>
                        </td>
                      ) : (
                        <td key={c.slug} class={classes(c.start && 'start', c.on && 'on')}>
                          <span class="vh">No</span>
                        </td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {companies.length > 0 && (
        <footer class="panel-foot">
          <nav class="pager" aria-label="Matrix rows">
            <span>
              Rows {first} to {first + rows.length - 1} of {companies.length.toLocaleString('en-GB')}
            </span>
            {pages > 1 && (
              <>
                <button type="button" class="link" disabled={current === 1} onClick={() => onPage(current - 1)}>
                  <span aria-hidden="true">← </span>Previous<span class="vh"> rows</span>
                </button>
                <button type="button" class="link" disabled={current === pages} onClick={() => onPage(current + 1)}>
                  Next<span class="vh"> rows</span>
                  <span aria-hidden="true"> →</span>
                </button>
              </>
            )}
          </nav>
        </footer>
      )}
    </section>
  );
}
