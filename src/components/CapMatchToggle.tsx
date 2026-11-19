// How two or more chosen capabilities combine: any of them (the default), or
// only places where all of them are found. Held in the URL as capmatch=all.
import type { CapMatch } from '../lib/url-state';

interface Props {
  count: number;
  value: CapMatch;
  onChange: (value: CapMatch) => void;
}

export default function CapMatchToggle({ count, value, onChange }: Props) {
  const pick = (e: Event) => onChange((e.currentTarget as HTMLInputElement).value === 'all' ? 'all' : 'any');
  return (
    <fieldset class="cap-match">
      <legend>Combine the {count} chosen capabilities</legend>
      <label class="choice">
        <input type="radio" name="capmatch" value="any" checked={value === 'any'} onChange={pick} /> Any chosen capability
      </label>
      <label class="choice">
        <input type="radio" name="capmatch" value="all" checked={value === 'all'} onChange={pick} /> Where all chosen capabilities overlap
      </label>
      <p class="hint">A place is an area of about 250 square kilometres. It counts when every chosen capability is found there, in one company or several.</p>
    </fieldset>
  );
}
