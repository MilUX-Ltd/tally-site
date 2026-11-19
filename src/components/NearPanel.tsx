// Near-me search: type a UK postcode, the first part of one, or a town, pick
// a distance, and see the companies within it. The place is looked up with
// postcodes.io only when the buyer presses Find; the resolved place and the
// distance are held in the URL.
import { useEffect, useState } from 'preact/hooks';
import { MAX_PLACE_LENGTH, NEAR_RADII, type NearRadius, type Place } from '../lib/near';

interface Props {
  place: Place | null;
  radius: NearRadius;
  busy: boolean;
  message: string;
  onFind: (text: string) => void;
  onRadius: (radius: NearRadius) => void;
  onClear: () => void;
}

export default function NearPanel({ place, radius, busy, message, onFind, onRadius, onClear }: Props) {
  const [text, setText] = useState(place?.name ?? '');
  useEffect(() => setText(place?.name ?? ''), [place?.name]);
  return (
    <fieldset class="sites-panel near-panel">
      <legend>Near a place</legend>
      <form
        class="near-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onFind(text);
        }}
      >
        <div class="sites-pickers">
          <p class="near-find">
            <label for="near-place">Postcode or town</label>
            <span class="search-row">
              <input
                id="near-place"
                type="text"
                autocomplete="postal-code"
                maxLength={MAX_PLACE_LENGTH}
                aria-describedby="near-hint"
                value={text}
                onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
              />
              <button type="submit" disabled={busy}>
                Find
              </button>
            </span>
          </p>
          <p>
            <label for="near-radius">Distance from the place</label>
            <select id="near-radius" value={String(radius)} onChange={(e) => onRadius(Number((e.currentTarget as HTMLSelectElement).value) as NearRadius)}>
              {NEAR_RADII.map((r) => (
                <option key={r} value={String(r)}>
                  {r} miles
                </option>
              ))}
            </select>
          </p>
        </div>
      </form>
      <p id="near-hint" class="site-source">
        A full postcode, the first part of one (such as BS16), or a town or city. What you type is sent to{' '}
        <a href="https://postcodes.io" rel="noopener noreferrer">
          postcodes.io
        </a>{' '}
        to find the place, and nothing else is sent. Choosing a place clears a chosen defence site.
      </p>
      <p role="status" class="near-status">
        {message}
      </p>
      {place && (
        <p>
          <button type="button" class="secondary" onClick={onClear}>
            Clear place
          </button>
        </p>
      )}
      <p class="sites-attribution">
        Places from Ordnance Survey and Office for National Statistics open data, Royal Mail and Crown copyright and database right, licensed{' '}
        <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" rel="noopener noreferrer">
          Open Government Licence v3.0
        </a>
        .
      </p>
    </fieldset>
  );
}
