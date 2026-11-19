// Plain-English search. The request goes to /api/search; the page reports
// what happened in its own words, never in the model's.
import { useEffect, useState } from 'preact/hooks';
import { MAX_QUERY_LENGTH } from '../lib/search';

interface Props {
  /** Keyword text in force (from a fallback or the URL); '' for none. */
  keywords: string;
  message: string;
  busy: boolean;
  onSearch: (text: string) => void;
  onClear: () => void;
}

export default function SearchBox({ keywords, message, busy, onSearch, onClear }: Props) {
  const [text, setText] = useState(keywords);
  useEffect(() => setText(keywords), [keywords]);
  return (
    <div class="search">
      <form
        role="search"
        class="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (value && !busy) onSearch(value);
        }}
      >
        <label for="plain-search">Search in plain English</label>
        <p id="plain-search-hint" class="search-hint">
          For example: counter-drone companies near Salisbury with Cyber Essentials Plus.
        </p>
        <div class="search-row">
          <input
            id="plain-search"
            type="search"
            maxLength={MAX_QUERY_LENGTH}
            aria-describedby="plain-search-hint"
            value={text}
            onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="submit" disabled={busy}>
            Search
          </button>
          {keywords && (
            <button type="button" class="secondary" onClick={onClear}>
              Clear search
            </button>
          )}
        </div>
      </form>
      <p id="search-status" role="status" class="search-status">
        {message || (keywords ? `Showing companies whose names, summaries or capabilities match: ${keywords}.` : '')}
      </p>
    </div>
  );
}
