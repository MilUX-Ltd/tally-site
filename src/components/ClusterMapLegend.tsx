// The cluster map's legend: every cluster with its colour, its Tally members
// (where Tally records them) and its upcoming events. Each entry is a button
// that chooses the cluster, so the map is never the only way to pick one.
import { STATUS_LABELS, type LegendEntry } from '../lib/clusters';
import { Swatch } from './ClustersPanel';

interface Props {
  entries: LegendEntry[];
  chosen: string | null;
  onTop: boolean;
  onOnTop: (onTop: boolean) => void;
  onChoose: (id: string) => void;
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
