// The one search: what is needed, near where, within how far. On the landing
// page it is the large card under the headline; after a search the same form
// becomes the compact bar, so the fields keep their text and focus.
import { useEffect, useRef, useState } from 'preact/hooks';
import { MAX_PLACE_LENGTH } from '../lib/near';
import { MAX_QUERY_LENGTH } from '../lib/search';

export interface Query {
  what: string;
  near: string;
}

interface Props {
  compact: boolean;
  busy: boolean;
  /** Keyword text in force (from a fallback or the link); '' for none. */
  keywords: string;
  /** The place or defence site in force; '' for none. */
  place: string;
  /** Distances offered, and the one chosen, in miles. */
  radii: readonly number[];
  within: number;
  /** Defence site names, offered as you type in Near. */
  siteNames: string[];
  /** Fills the fields from an example search; a new object each time. */
  preset: (Query & { clear?: boolean }) | null;
  onSubmit: (query: Query) => void;
  onWithin: (miles: number) => void;
}

export default function SearchForm({ compact, busy, keywords, place, radii, within, siteNames, preset, onSubmit, onWithin }: Props) {
  const [what, setWhat] = useState(keywords);
  const [near, setNear] = useState(place);
  const lastKeywords = useRef(keywords);
  useEffect(() => {
    // Keyword text set or cleared elsewhere (a fallback, a chip) shows in the box.
    setWhat((text) => (keywords ? keywords : text === lastKeywords.current ? '' : text));
    lastKeywords.current = keywords;
  }, [keywords]);
  useEffect(() => setNear(place), [place]);
  useEffect(() => {
    if (!preset) return;
    setWhat(preset.what);
    setNear(preset.near);
  }, [preset]);
  return (
    <form
      role="search"
      class={`search-form ${compact ? 'compact' : 'large'}`}
      aria-label="Find companies"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit({ what: what.trim(), near: near.replace(/\s+/g, ' ').trim() });
      }}
    >
      <div class="search-card fields">
        <div class="field field-what">
          <label for="search-what" class="mono">
            What<span class={compact ? 'vh' : undefined}> do you need?</span>
          </label>
          <input
            id="search-what"
            type="search"
            autocomplete="off"
            maxLength={MAX_QUERY_LENGTH}
            aria-describedby="search-hint"
            placeholder={compact ? 'Capability or keyword' : 'For example, counter-drone, secure comms, test ranges'}
            value={what}
            onInput={(e) => setWhat((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <div class="field field-near">
          <label for="search-near" class="mono">
            Near
          </label>
          <input
            id="search-near"
            type="text"
            autocomplete="off"
            list="search-sites"
            maxLength={MAX_PLACE_LENGTH}
            aria-describedby="search-hint"
            placeholder={compact ? 'Postcode or town' : 'Postcode, town or defence site'}
            value={near}
            onInput={(e) => setNear((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <div class="field field-within">
          <label for="search-within" class="mono">
            Within
          </label>
          <select id="search-within" value={String(within)} onChange={(e) => onWithin(Number((e.currentTarget as HTMLSelectElement).value))}>
            {radii.map((r) => (
              <option key={r} value={String(r)}>
                {r} miles
              </option>
            ))}
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" disabled={busy}>
          Search
        </button>
      </div>
      <datalist id="search-sites">
        {siteNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p id="search-hint" class={compact ? 'vh' : 'search-hint'}>
        An AI model (Claude, from Anthropic) turns your words into filters. Tally does not keep what you type. For Near, try BS16, Bristol or a defence site such as RAF Brize Norton; we send a postcode or town to postcodes.io to find it.
      </p>
    </form>
  );
}
