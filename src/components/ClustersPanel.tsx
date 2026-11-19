// Regional clusters: show their areas and upcoming events on the map, and
// pick one to narrow the companies to its recorded members. The overlay and
// the chosen cluster are held in the URL. Members-only events show only the
// signpost and a link to join the cluster.
import { STATUS_LABELS, shortDate, type Cluster, type ClusterEvent, type ClustersData, type RegionsData } from '../lib/clusters';

interface Props {
  data: ClustersData | null;
  events: ClusterEvent[];
  regions: RegionsData | null;
  failed: boolean;
  show: boolean;
  cluster: Cluster | null;
  memberCount: number | null;
  onShow: (show: boolean) => void;
  onCluster: (id: string | null) => void;
}

const optionLabel = (c: Cluster) => (c.status === 'live' ? c.name : `${c.name} (${STATUS_LABELS[c.status].toLowerCase()})`);

export function Swatch({ colour }: { colour: string }) {
  return (
    <svg class="cluster-swatch" width="20" height="14" viewBox="0 0 20 14" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="18" height="12" fill={colour} fill-opacity="0.35" stroke={colour} stroke-width="2" />
    </svg>
  );
}

export default function ClustersPanel({ data, events, regions, failed, show, cluster, memberCount, onShow, onCluster }: Props) {
  if (failed) return <p class="clusters-panel">Clusters could not be loaded.</p>;
  if (!data) return null;
  const sorted = [...data.clusters].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  const own = cluster ? events.filter((e) => e.cluster === cluster.id) : [];
  return (
    <fieldset class="clusters-panel">
      <legend>Clusters</legend>
      <label class="choice">
        <input type="checkbox" checked={show} onChange={(e) => onShow((e.currentTarget as HTMLInputElement).checked)} /> Show cluster areas on the map
      </label>
      <p class="clusters-picker">
        <label for="cluster-pick">Companies in a cluster</label>
        <select id="cluster-pick" value={cluster?.id ?? ''} onChange={(e) => onCluster((e.currentTarget as HTMLSelectElement).value || null)}>
          <option value="">No cluster chosen</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {optionLabel(c)}
            </option>
          ))}
        </select>
      </p>
      {cluster && (
        <div class="cluster-detail">
          <p>
            <Swatch colour={cluster.colour} /> <strong>{cluster.full}</strong>: {cluster.region}. {STATUS_LABELS[cluster.status]}.
          </p>
          <p>
            {memberCount != null
              ? `Showing the ${memberCount === 1 ? 'company' : `${memberCount} companies`} Tally records as members.`
              : 'Tally does not yet record which companies belong to this cluster, so the companies are not narrowed.'}
          </p>
          {(cluster.web || cluster.linkedin) && (
            <p class="cluster-links">
              {cluster.web && (
                <a href={cluster.web} rel="noopener noreferrer">
                  {cluster.name} cluster website
                </a>
              )}
              {cluster.linkedin && (
                <a href={cluster.linkedin} rel="noopener noreferrer">
                  {cluster.name} cluster on LinkedIn
                </a>
              )}
            </p>
          )}
          {own.length > 0 && (
            <>
              <h3 class="cluster-events-heading">Upcoming events</h3>
              <ul class="cluster-events">
                {own.slice(0, 5).map((e, i) =>
                  e.audience === 'public' ? (
                    <li key={i}>
                      {shortDate(e.date)}:{' '}
                      {e.link ? (
                        <a href={e.link} rel="noopener noreferrer">
                          {e.title}
                        </a>
                      ) : (
                        e.title
                      )}
                    </li>
                  ) : (
                    <li key={i}>
                      {shortDate(e.date)}: {e.text}.{' '}
                      <a href={e.link} rel="noopener noreferrer">
                        Join the cluster
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </>
          )}
        </div>
      )}
      {show && (
        <ul class="cluster-legend" aria-label="Cluster colours">
          {sorted.map((c) => (
            <li key={c.id}>
              <Swatch colour={c.colour} /> {optionLabel(c)}
            </li>
          ))}
        </ul>
      )}
      <p class="clusters-more">
        <a href="/events">See all upcoming cluster events</a>
        {show && ' Each marker on the map shows how many upcoming events a cluster has.'}
      </p>
      <p class="clusters-attribution">
        Cluster areas: Office for National Statistics boundaries, licensed under the{' '}
        <a href={regions?.licence_url ?? 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'} rel="noopener noreferrer">
          Open Government Licence v3.0
        </a>
        . Contains OS data © Crown copyright and database right 2025. Areas are approximate.
      </p>
    </fieldset>
  );
}
