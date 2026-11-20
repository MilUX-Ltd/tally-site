// Every active filter as a chip with a remove button, then Clear all. The
// chips are the one place that shows everything narrowing the results.
import { useRef } from 'preact/hooks';

export interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export default function Chips({ chips, onClear }: { chips: Chip[]; onClear: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  if (chips.length === 0) return null;
  // Removing a chip removes the button that had focus; pass it on to the next
  // one, or to the search when none is left.
  const refocus = () =>
    requestAnimationFrame(() => {
      const next = box.current?.isConnected ? box.current.querySelector<HTMLElement>('button') : null;
      (next ?? document.getElementById('search-what'))?.focus();
    });
  return (
    <div class="chips" ref={box}>
      <ul aria-label="Active filters">
        {chips.map((chip) => (
          <li key={chip.key} class="chip">
            <span>{chip.label}</span>
            <button
              type="button"
              onClick={() => {
                chip.onRemove();
                refocus();
              }}
            >
              <span class="vh">Remove {chip.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        class="link"
        onClick={() => {
          onClear();
          refocus();
        }}
      >
        Clear all
      </button>
    </div>
  );
}
