// How two or more chosen capabilities combine: any of them (the default), or
// only places where all of them are found. Held in the URL as capmatch=all.
import type { CapMatch } from '../lib/url-state';

interface Props {
  value: CapMatch;
  onChange: (value: CapMatch) => void;
}

export default function CapMatchToggle({ value, onChange }: Props) {
  const pick = (e: Event) => onChange((e.currentTarget as HTMLInputElement).value === 'all' ? 'all' : 'any');
  return (
    <fieldset class="cap-match">
      <legend>Show companies with</legend>
      <label class="choice">
        <input type="radio" name="capmatch" value="any" checked={value === 'any'} onChange={pick} /> any of these capabilities
      </label>
      <label class="choice">
        <input type="radio" name="capmatch" value="all" checked={value === 'all'} onChange={pick} /> all of them in the same area
      </label>
      <p class="hint">An area is a place of about 250 square kilometres. It counts when every chosen capability is found there, in one company or several.</p>
    </fieldset>
  );
}
