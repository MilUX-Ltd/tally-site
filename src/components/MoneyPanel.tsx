// The Money view's panel: where UK defence contract money went in a year, by
// region, by overseas country, to which Tally companies and by capability.
// It sits beside the map, which shades the regions and draws the overseas
// money; every figure on the map is also in these tables.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { companyPath, longDate } from '../lib/company-page';
import { capabilityRows, formatMoney, overseasRows, regionRows, sharePercent, tallyWinners, yearTotals, type MoneyData } from '../lib/money';
import type { Company, Taxonomy } from '../lib/types';

interface Props {
  money: MoneyData | null;
  failed: boolean;
  onRetry: () => void;
  /** The year shown. */
  year: number | null;
  onYear: (year: number) => void;
  companies: Company[] | null;
  taxonomy: Taxonomy | null;
  /** Whether the map is zoomed out to show the overseas money, and whether there is any to show. */
  overseas: boolean;
  canShowOverseas: boolean;
  onOverseas: (on: boolean) => void;
  /** Goes up by one when the heading should take focus. */
  focus: number;
}

const contracts = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'contract' : 'contracts'}`;
const notices = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'notice' : 'notices'}`;
const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export default function MoneyPanel(p: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (p.focus > 0) heading.current?.focus();
  }, [p.focus]);

  const { money, year } = p;
  const figures = useMemo(() => {
    if (!money || year === null) return null;
    const winners = p.companies ? tallyWinners(money, year, p.companies) : [];
    return {
      totals: yearTotals(money, year),
      regions: regionRows(money, year),
      overseas: overseasRows(money, year),
      winners,
      capabilities: p.taxonomy ? capabilityRows(winners, p.taxonomy) : [],
    };
  }, [money, year, p.companies, p.taxonomy]);

  return (
    <section class="panel money" aria-labelledby="money-heading">
      <header class="panel-head">
        <div>
          <h2 id="money-heading" ref={heading} tabIndex={-1}>
            Defence contract money
          </h2>
          <p>{figures && year !== null ? `Contracts UK defence buyers awarded in ${year}, by where the supplier is.` : p.failed ? '' : 'Loading the figures.'}</p>
        </div>
      </header>
      <div class="panel-body money-body">
        {p.failed && !money ? (
          <div class="empty">
            <p>The contract figures could not be loaded.</p>
            <p>
              <button type="button" class="btn" onClick={p.onRetry}>
                Try again
              </button>
            </p>
          </div>
        ) : !money || !figures || year === null ? null : (
          <>
            <dl class="money-totals">
              <div>
                <dt class="mono">UK regions</dt>
                <dd>{formatMoney(figures.totals.uk.value)}</dd>
                <dd class="money-count">{contracts(figures.totals.uk.count)}</dd>
              </div>
              <div>
                <dt class="mono">Overseas suppliers</dt>
                <dd>{formatMoney(figures.totals.overseas.value)}</dd>
                <dd class="money-count">{contracts(figures.totals.overseas.count)}</dd>
              </div>
              <div>
                <dt class="mono">UK, region not known</dt>
                <dd>{formatMoney(figures.totals.unplaced.value)}</dd>
                <dd class="money-count">{contracts(figures.totals.unplaced.count)}</dd>
              </div>
            </dl>

            <div class="money-controls">
              <div class="money-years" role="radiogroup" aria-labelledby="money-year-label">
                <span id="money-year-label" class="mono">
                  Year
                </span>
                {[...money.years].sort((a, b) => a - b).map((y) => (
                  <label key={y} class={y === year ? 'money-year is-on' : 'money-year'}>
                    <input type="radio" name="money-year" value={String(y)} checked={y === year} onChange={() => p.onYear(y)} />
                    {y}
                  </label>
                ))}
              </div>
              {p.canShowOverseas && (
                <button type="button" class="btn btn-sm" onClick={() => p.onOverseas(!p.overseas)}>
                  {p.overseas ? 'Back to the UK' : 'See overseas'}
                </button>
              )}
            </div>

            <table class="money-table">
              <caption>Contract money by region</caption>
              <thead>
                <tr>
                  <th scope="col">Region</th>
                  <th scope="col" class="num">
                    Value
                  </th>
                  <th scope="col" class="num">
                    Contracts
                  </th>
                  <th scope="col" class="num">
                    To Tally companies
                  </th>
                </tr>
              </thead>
              <tbody>
                {figures.regions.map((r) => (
                  <tr key={r.region}>
                    <th scope="row">{r.region}</th>
                    <td class="num">{formatMoney(r.value)}</td>
                    <td class="num">{r.count.toLocaleString('en-GB')}</td>
                    <td class="num">{sharePercent(r.tally_value, r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {figures.overseas.length ? (
              <table class="money-table">
                <caption>Contract money to overseas suppliers</caption>
                <thead>
                  <tr>
                    <th scope="col">Country</th>
                    <th scope="col" class="num">
                      Value
                    </th>
                    <th scope="col" class="num">
                      Contracts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {figures.overseas.map((r) => (
                    <tr key={r.country}>
                      <th scope="row">{r.country}</th>
                      <td class="num">{formatMoney(r.value)}</td>
                      <td class="num">{r.count.toLocaleString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p class="money-none">No contract money to overseas suppliers in {year}.</p>
            )}

            <h3 id="money-winners">Tally companies winning contracts</h3>
            {figures.winners.length ? (
              <ol class="money-winners" aria-labelledby="money-winners">
                {figures.winners.map((w) => (
                  <li key={w.company.id}>
                    <a href={companyPath(w.company.id)}>{w.company.name}</a>
                    <span class="money-win">
                      {formatMoney(w.value)}
                      <span class="money-count"> · {contracts(w.count)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p class="money-none">No Tally companies won contracts in {year}.</p>
            )}

            {figures.capabilities.length > 0 && (
              <>
                <table class="money-table">
                  <caption>Contract money by capability</caption>
                  <thead>
                    <tr>
                      <th scope="col">Capability</th>
                      <th scope="col" class="num">
                        Value
                      </th>
                      <th scope="col" class="num">
                        Companies
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {figures.capabilities.map((r) => (
                      <tr key={r.slug}>
                        <th scope="row">{r.label}</th>
                        <td class="num">{formatMoney(r.value)}</td>
                        <td class="num">{r.companies.toLocaleString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p class="money-note">Tally companies only. A company with more than one capability counts under each, so the rows add up to more than the total.</p>
              </>
            )}

            <h3>About these figures</h3>
            <div class="money-about">
              <p>
                Contracts awarded by UK defence buyers from {longDate(money.period.from)} to {longDate(money.period.to)}, from award notices published on {andList(money.sources)}.
              </p>
              <p>Each figure is the whole-contract value given when the contract was awarded. A contract can run for several years, so this is not spending in one year.</p>
              <p>
                Framework agreements and dynamic purchasing systems are left out, because their ceilings are not money spent
                {money.excluded.frameworks > 0 ? ` (${notices(money.excluded.frameworks)} left out)` : ''}.
              </p>
              <p>Government-to-government purchases, such as US Foreign Military Sales, are not published as UK award notices and do not appear here.</p>
              <p>UK suppliers are placed in a region by postcode. Tally companies are matched by Companies House number, or by name.</p>
              <p>{money.attribution}</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
