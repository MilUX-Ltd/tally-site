// The cluster map's legend: every cluster with its colour, its Tally members
// (where Tally records them) and its upcoming events. Each entry is a button
// that chooses the cluster, so the map is never the only way to pick one.
import { STATUS_LABELS, type LegendEntry } from '../lib/clusters';

interface Props {
  entries: LegendEntry[];
  chosen: string | null;
  onTop: boolean;
  onOnTop: (onTop: boolean) => void;
  onChoose: (id: string) => void;
}

/** A cluster's map colour: filled for a live cluster, a dashed outline for one not yet live. */
function Swatch({ colour, outline = false }: { colour: string; outline?: boolean }) {
  return (
    <svg class="cluster-swatch" width="20" height="14" viewBox="0 0 20 14" aria-hidden="true" focusable="false">
      {outline ? (
        <rect x="1" y="1" width="18" height="12" fill="none" stroke={colour} stroke-width="2" stroke-dasharray="4 2" />
      ) : (
        <rect x="1" y="1" width="18" height="12" fill={colour} fill-opacity="0.4" stroke={colour} stroke-width="2" />
      )}
    </svg>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ClusterMapLegend({ entries, chosen, onTop, onOnTop, onChoose }: Props) {
  return (
    <section class="cluster-map-legend" aria-labelledby="cluster-map-heading">
      <h3 id="cluster-map-heading">Cluster map</h3>
      <label class="choice">
        <input type="checkbox" checked={onTop} onChange={(e) => onOnTop((e.currentTarget as HTMLInputElement).checked)} /> Show companies on top
      </label>
      <p class="cluster-map-hint">Choose a cluster here or select its area on the map to narrow the companies to its members.</p>
      <ul aria-label="Clusters on the map">
        {entries.map((e) => (
          <li key={e.id}>
            <button type="button" class="cluster-map-entry" aria-pressed={e.id === chosen} onClick={() => onChoose(e.id)}>
              <Swatch colour={e.mapColour} outline={e.status !== 'live'} />
              <span class="cluster-map-name">
                {e.name}
                {e.status !== 'live' && ` (${STATUS_LABELS[e.status].toLowerCase()})`}
              </span>{' '}
              <span class="cluster-map-detail">
                {e.members == null ? 'members not recorded' : count(e.members, 'Tally member', 'Tally members')}, {count(e.events, 'upcoming event', 'upcoming events')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p class="cluster-map-note">
        Areas are approximate and some overlap: Greater Lincolnshire shares ground with East Midlands and Yorkshire, so smaller areas are drawn on top.
        Some places, such as Berkshire, Milton Keynes and North Somerset, have no cluster. Clusters not yet live are drawn as a dashed outline.
        Map colours tell the areas apart and are not the clusters' own brand colours.
      </p>
    </section>
  );
}
