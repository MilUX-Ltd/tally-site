// The Money view's panel: where UK defence contract money went in a year, by
// region, by overseas country, to which Tally companies and by capability.
// It sits beside the map, which shades the regions and draws the overseas
// money; every figure on the map is also in these tables.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { companyPath, longDate } from '../lib/company-page';
import { latestFinancialYear, recentFinancialYears, spendRows, type ModSpend } from '../lib/mod-spend';
import type { MoneyMeasure } from '../lib/url-state';
import { capabilityRows, formatMoney, overseasRows, regionRows, regionSmeShare, sharePercent, smeTotals, tallyWinners, yearTotals, type MoneyData } from '../lib/money';
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
  /** Contract awards, or MOD's official spend with industry (card 7475). */
  measure: MoneyMeasure;
  onMeasure: (measure: MoneyMeasure) => void;
  modSpend: ModSpend | null;
  modSpendFailed: boolean;
  /** The financial year shown under MOD spend, as "2025/26". */
  spendYear: string | null;
  onSpendYear: (year: string) => void;
  /** Goes up by one when the heading should take focus. */
  focus: number;
}

const contracts = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'contract' : 'contracts'}`;
const notices = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'notice' : 'notices'}`;
const perPerson = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
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
      sme: smeTotals(money, year),
      regions: regionRows(money, year),
      overseas: overseasRows(money, year),
      winners,
      capabilities: p.taxonomy ? capabilityRows(winners, p.taxonomy) : [],
    };
  }, [money, year, p.companies, p.taxonomy]);

  const spend = p.measure === 'spend';
  const { modSpend, spendYear } = p;
  const spendFigures = useMemo(() => (modSpend && spendYear ? { rows: spendRows(modSpend, spendYear), total: modSpend.uk[spendYear] ?? 0 } : null), [modSpend, spendYear]);
  const subtitle = spend
    ? spendFigures && spendYear
      ? `MOD’s direct spend with UK industry in ${spendYear}, by region, from official statistics.`
      : p.modSpendFailed
        ? ''
        : 'Loading the figures.'
    : figures && year !== null
      ? `Contracts UK defence buyers awarded in ${year}, by where the supplier is.`
      : p.failed
        ? ''
        : 'Loading the figures.';

  return (
    <section class="panel money" aria-labelledby="money-heading">
      <header class="panel-head">
        <div>
          <h2 id="money-heading" ref={heading} tabIndex={-1}>
            Defence contract money
          </h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div class="panel-body money-body">
        <div class="money-measure" role="radiogroup" aria-labelledby="money-measure-label">
          <span id="money-measure-label" class="mono">
            Measure
          </span>
          {(
            [
              ['awards', 'Contract awards'],
              ['spend', 'MOD spend with industry'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} class={p.measure === value ? 'money-year is-on' : 'money-year'}>
              <input type="radio" name="money-measure" value={value} checked={p.measure === value} onChange={() => p.onMeasure(value)} />
              {label}
            </label>
          ))}
        </div>
        {spend ? (
          <SpendBody {...p} rows={spendFigures?.rows ?? null} total={spendFigures?.total ?? 0} />
        ) : p.failed && !money ? (
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
            {modSpend && (
              <p class="money-scale">
                For scale: MOD spent {formatMoney(modSpend.uk[latestFinancialYear(modSpend)] ?? 0)} with UK industry in {latestFinancialYear(modSpend)} (official statistics).{' '}
                <button type="button" class="link" onClick={() => p.onMeasure('spend')}>
                  See MOD spend by region
                </button>
              </p>
            )}
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

            {figures.sme && figures.sme.sme + figures.sme.large > 0 && (
              <p class="money-sme">
                Small and medium-sized firms won {sharePercent(figures.sme.sme, figures.sme.sme + figures.sme.large)} ({formatMoney(figures.sme.sme)}) of UK regional contract money where the
                supplier’s size is known.
                {/* Below £1,000 is rounding between the size figures, not money of unknown size. */}
                {figures.sme.unknown >= 1000 ? ` Size is not known for ${formatMoney(figures.sme.unknown)}.` : ''}
              </p>
            )}

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
                    Share to Tally companies
                  </th>
                  {figures.sme && (
                    <th scope="col" class="num">
                      Share to SMEs
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {figures.regions.map((r) => (
                  <tr key={r.region}>
                    <th scope="row">{r.region}</th>
                    <td class="num">{formatMoney(r.value)}</td>
                    <td class="num">{r.count.toLocaleString('en-GB')}</td>
                    <td class="num">{sharePercent(r.tally_value, r.value)}</td>
                    {figures.sme && <td class="num">{regionSmeShare(r)}</td>}
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
              <p class="money-none">No Tally companies are matched to contracts awarded in {year}.</p>
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
              {figures.sme && (
                <p>
                  SME means a small or medium-sized firm. Supplier size is as the supplier declared it on {andList(money.sources)}; it is not checked, and a UK firm owned by a larger
                  group may declare itself an SME. The SME share leaves out overseas suppliers, UK suppliers that could not be placed in a region, and money with no known size.
                </p>
              )}
              <p>{money.attribution}</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** The MOD spend measure: official statistics by region for a financial year. */
function SpendBody(p: Props & { rows: ReturnType<typeof spendRows> | null; total: number }) {
  const d = p.modSpend;
  const year = p.spendYear;
  if (p.modSpendFailed && !d) {
    return (
      <div class="empty">
        <p>The official spend figures could not be loaded.</p>
        <p>
          <button type="button" class="btn" onClick={p.onRetry}>
            Try again
          </button>
        </p>
      </div>
    );
  }
  if (!d || !year || !p.rows) return null;
  const choices = [...recentFinancialYears(d)].reverse();
  return (
    <>
      <dl class="money-totals">
        <div>
          <dt class="mono">UK total, {year}</dt>
          <dd>{formatMoney(p.total)}</dd>
          <dd class="money-count">MOD direct spend with UK industry</dd>
        </div>
      </dl>

      <div class="money-controls">
        <div class="money-years" role="radiogroup" aria-labelledby="money-fy-label">
          <span id="money-fy-label" class="mono">
            Financial year
          </span>
          {choices.map((y) => (
            <label key={y} class={y === year ? 'money-year is-on' : 'money-year'}>
              <input type="radio" name="money-fy" value={y} checked={y === year} onChange={() => p.onSpendYear(y)} />
              {y}
            </label>
          ))}
        </div>
      </div>

      <table class="money-table">
        <caption>MOD spend with UK industry by region, {year}</caption>
        <thead>
          <tr>
            <th scope="col">Region</th>
            <th scope="col" class="num">
              Spend
            </th>
            <th scope="col" class="num">
              Per person
            </th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.region}>
              <th scope="row">{r.region}</th>
              <td class="num">{formatMoney(r.value)}</td>
              <td class="num">{perPerson(r.per_person)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>About these figures</h3>
      <div class="money-about">
        <p>
          Official statistics from the Ministry of Defence: <a href={d.source.url}>MOD regional expenditure with industry</a>, published {longDate(d.source.published)}.
        </p>
        <p>MOD’s direct spend with UK industry in each financial year (April to March), at current prices: money paid out in the year, not adjusted for inflation.</p>
        <p>Spend is placed mainly by where the work is done, not where the supplier’s head office is.</p>
        <p>Money a prime contractor passes on to sub-contractors is counted where the prime contract’s work is recorded, not where the sub-contractor is.</p>
        <p>Spending overseas, and purchases through US Foreign Military Sales, are not in the regional figures.</p>
        {d.breaks.length > 0 && (
          <p>
            MOD changed its method in {andList(d.breaks)}, so years before and after {d.breaks.length === 1 ? 'that change' : 'those changes'} are not directly comparable.
          </p>
        )}
        <p>
          This differs from contract awards. Contract awards count a contract’s whole value in the year it is awarded, even when the work runs for several years; these figures count money
          spent in the year.
        </p>
        <p>Spend per person is a region’s spend divided by its population, as MOD publishes it.</p>
        <p>{d.attribution}</p>
      </div>
    </>
  );
}
