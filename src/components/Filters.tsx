// The filter groups shown in the Filters side panel: capabilities by group,
// then company facets.
import { useEffect, useRef } from 'preact/hooks';
import type { Facet, Filters as FilterState } from '../lib/filters';
import type { Option, Taxonomy } from '../lib/types';

interface Props {
  taxonomy: Taxonomy;
  filters: FilterState;
  onToggle: (facet: Facet, value: string, on: boolean) => void;
  /** Goes up by one each time a search sets the filters. */
  reveal: number;
  /** The place choices for the scope: its regions (the UK's when absent), or countries across several. */
  places?: { facet: 'region' | 'country'; options: Option[] };
  /** The countries chosen, across several countries. */
  countries?: string[];
  onCountry?: (code: string, on: boolean) => void;
}

interface ChoicesProps {
  title: string;
  options: Option[];
  selected: string[];
  onChange: (value: string, on: boolean) => void;
  reveal: number;
  /** Starts open: the place choices in a scope other than the UK, where they are new. */
  startOpen?: boolean;
}

function FacetChoices({ facet, title, options, filters, onToggle, reveal, startOpen }: { facet: Facet; title: string; options: Option[]; startOpen?: boolean } & Pick<Props, 'filters' | 'onToggle' | 'reveal'>) {
  return <Choices title={title} options={options} selected={filters[facet]} onChange={(value, on) => onToggle(facet, value, on)} reveal={reveal} startOpen={startOpen} />;
}

function Choices({ title, options, selected, onChange, reveal, startOpen = false }: ChoicesProps) {
  const count = options.filter((o) => selected.includes(o.slug)).length;
  // After a search sets the filters, groups holding a chosen value open so
  // the choices are visible. They never close on their own.
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (reveal > 0 && count > 0 && details.current) details.current.open = true;
    // Only a new search should open groups, not every change of count.
  }, [reveal]);
  return (
    <details class="filter-group" ref={details} open={startOpen}>
      <summary>
        {title}
        {count > 0 && <span class="filter-count"> ({count} selected)</span>}
      </summary>
      <fieldset>
        <legend class="vh">{title}</legend>
        {options.map((o) => (
          <label key={o.slug} class={o.slug.includes('/') ? 'choice child' : 'choice'}>
            <input
              type="checkbox"
              checked={selected.includes(o.slug)}
              onChange={(e) => onChange(o.slug, (e.currentTarget as HTMLInputElement).checked)}
            />{' '}
            {o.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

export default function Filters({ taxonomy, filters, onToggle, reveal, places, countries = [], onCountry }: Props) {
  return (
    <div class="filters">
      <h3>Capabilities</h3>
      {taxonomy.groups.map((g) => (
        <FacetChoices
          key={g.slug}
          facet="cap"
          title={g.label}
          options={taxonomy.capabilities.filter((c) => c.group === g.slug)}
          filters={filters}
          reveal={reveal}
          onToggle={onToggle}
        />
      ))}
      <h3>Companies</h3>
      <FacetChoices facet="size" title="Size" options={taxonomy.sizes} filters={filters} onToggle={onToggle} reveal={reveal} />
      {places?.facet === 'country' ? (
        <Choices title="Country" options={places.options} selected={countries} onChange={(code, on) => onCountry?.(code, on)} reveal={reveal} startOpen />
      ) : (
        <FacetChoices facet="region" title="Region" options={places?.options ?? taxonomy.regions} filters={filters} onToggle={onToggle} reveal={reveal} startOpen={Boolean(places)} />
      )}
      <FacetChoices facet="fw" title="Frameworks" options={taxonomy.frameworks} filters={filters} onToggle={onToggle} reveal={reveal} />
      <FacetChoices facet="accr" title="Accreditations" options={taxonomy.accreditations} filters={filters} onToggle={onToggle} reveal={reveal} />
      <FacetChoices facet="mbr" title="Memberships" options={taxonomy.memberships} filters={filters} onToggle={onToggle} reveal={reveal} />
    </div>
  );
}
