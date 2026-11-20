// The capability matrix: a real table of companies against capabilities,
// grouped by capability group. Ticking a column sets the capability filter,
// which redraws the map; an area on the map narrows the rows.
import { useMemo } from 'preact/hooks';
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
  onToggleCap: (slug: string, on: boolean) => void;
  onGroup: (group: string | null) => void;
  onPage: (page: number) => void;
}

export default function Matrix({ taxonomy, companies, selectedCaps, group, page, scope: which, onToggleCap, onGroup, onPage }: Props) {
  const groups = useMemo(() => matrixColumns(taxonomy, group), [taxonomy, group]);
  const columns = groups.flatMap((g) => g.columns);
  const { rows, page: current, pages } = matrixPage(companies, page);
  const first = (current - 1) * MATRIX_PAGE_SIZE + 1;
  const scope = which === 'area' ? ' in the selected area' : which === 'shortlist' ? ' on your shortlist' : '';
  return (
    <section class="matrix" aria-labelledby="matrix-heading">
      <h2 id="matrix-heading">Compare capabilities</h2>
      <p>
        {companies.length === 1 ? '1 company' : `${companies.length} companies`}
        {scope}. Tick a capability to show only companies that offer it; the map redraws to match.
      </p>
      <p class="matrix-controls">
        <label for="matrix-group">Capabilities shown</label>
        <select id="matrix-group" value={group ?? ''} onChange={(e) => onGroup((e.currentTarget as HTMLSelectElement).value || null)}>
          <option value="">All groups</option>
          {taxonomy.groups.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.label}
            </option>
          ))}
        </select>
      </p>
      <div class="matrix-scroll" tabIndex={0} role="region" aria-label="Compare capabilities table, scrolls sideways">
        <table>
          <caption class="vh">Compare capabilities: companies by capability</caption>
          <colgroup />
          {groups.map((g) => (
            <colgroup key={g.group.slug} span={g.columns.length} />
          ))}
          <thead>
            <tr>
              <td />
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
              {columns.map((c) => (
                <th key={c.slug} scope="col" class="cap-head">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedCaps.includes(c.slug)}
                      onChange={(e) => onToggleCap(c.slug, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span class="vh">Filter by </span>
                    <span class="cap-label">{c.label}</span>
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((company) => (
              <tr key={company.id}>
                <th scope="row">
                  <a href={companyPath(company.id)}>{company.name}</a>
                </th>
                {columns.map((c) =>
                  hasCapability(company, c.slug) ? (
                    <td key={c.slug} class="tick">
                      <span aria-hidden="true">&#9679;</span>
                      <span class="vh">Yes</span>
                    </td>
                  ) : (
                    <td key={c.slug}>
                      <span class="vh">No</span>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav class="pager" aria-label="Matrix rows">
          <button type="button" class="link" disabled={current === 1} onClick={() => onPage(current - 1)}>
            Previous<span class="vh"> rows</span>
          </button>
          <span>
            Rows {first} to {first + rows.length - 1} of {companies.length}
          </span>
          <button type="button" class="link" disabled={current === pages} onClick={() => onPage(current + 1)}>
            Next<span class="vh"> rows</span>
          </button>
        </nav>
      )}
    </section>
  );
}
