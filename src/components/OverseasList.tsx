// Overseas companies that match the filters, listed by country: Europe first,
// then the rest of the world, a page at a time. They are never drawn on the UK map.
import { useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import CompanyItem from './CompanyItem';
import { Pager, pageOf } from './ResultsList';
import { overseasByCountry, type CountryGroup } from '../lib/countries';
import type { Company } from '../lib/types';

interface Props {
  companies: Company[];
  /** Overlap mode is about places on the UK map; overseas companies with any chosen capability are listed. */
  overlap?: boolean;
  page: number;
  onPage: (page: number) => void;
  actions?: (company: Company) => ComponentChildren;
}

function Region({ title, id, groups, actions }: { title: string; id: string; groups: CountryGroup[]; actions: Props['actions'] }) {
  if (!groups.length) return null;
  return (
    <section aria-labelledby={id} class="overseas-region">
      <h3 id={id}>{title}</h3>
      {groups.map((g) => (
        <div key={g.country} class="overseas-country">
          <h4>{g.country}</h4>
          <ul class="company-list" aria-label={`Companies in ${g.country}`}>
            {g.companies.map((c) => (
              <CompanyItem key={c.id} company={c} headingLevel={5}>
                {actions?.(c)}
              </CompanyItem>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default function OverseasList({ companies, overlap = false, page, onPage, actions }: Props) {
  // Europe first, then the rest of the world, by country; one page of that order is shown.
  const ordered = useMemo(() => {
    const all = overseasByCountry(companies);
    return [...all.europe, ...all.world].flatMap((g) => g.companies);
  }, [companies]);
  const { shown, current, pages } = pageOf(ordered, page);
  const { europe, world } = overseasByCountry(shown);
  return (
    <section class="overseas" aria-labelledby="overseas-heading">
      <h2 id="overseas-heading">Overseas companies</h2>
      <p>
        Companies based outside the UK, by country. They are not shown on the UK map
        {overlap ? ', so overlap places do not apply: those with any chosen capability are listed' : ''}.
      </p>
      {europe.length + world.length === 0 ? (
        <p>No overseas companies match these filters.</p>
      ) : (
        <>
          <Region title="Europe" id="overseas-europe" groups={europe} actions={actions} />
          <Region title="Rest of the world" id="overseas-world" groups={world} actions={actions} />
          <Pager label="Overseas pages" current={current} pages={pages} onPage={onPage} />
        </>
      )}
    </section>
  );
}
