// What the Layers control holds: the cluster areas and the defence sites,
// each with its switch for the map and a way to narrow the companies without
// using the map. The licence credits are one line each here; the full text is
// on the About page.
import type { ComponentChildren } from 'preact';
import ClusterMapLegend from './ClusterMapLegend';
import { STATUS_LABELS, type Cluster, type ClustersData, type LegendEntry } from '../lib/clusters';
import { KIND_LABELS, type Site, type SitesData } from '../lib/sites';

const OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

interface Props {
  clusters: ClustersData | null;
  clustersFailed: boolean;
  showClusters: boolean;
  cluster: Cluster | null;
  /** Members Tally records for the chosen cluster, or null when it records none. */
  memberCount: number | null;
  legend: LegendEntry[] | null;
  onTop: boolean;
  licenceUrl?: string;
  onShowClusters: (show: boolean) => void;
  onCluster: (id: string | null) => void;
  onOnTop: (onTop: boolean) => void;
  sites: SitesData | null;
  sitesFailed: boolean;
  showSites: boolean;
  site: Site | null;
  onShowSites: (show: boolean) => void;
  onSite: (id: string | null) => void;
  /** Map style and map tools, shown here on a phone. */
  children?: ComponentChildren;
}

const optionLabel = (c: Cluster) => (c.status === 'live' ? c.name : `${c.name} (${STATUS_LABELS[c.status].toLowerCase()})`);
const checked = (e: Event) => (e.currentTarget as HTMLInputElement).checked;
const chosen = (e: Event) => (e.currentTarget as HTMLSelectElement).value || null;

export default function LayersPanel(p: Props) {
  const sorted = p.clusters ? [...p.clusters.clusters].sort((a, b) => a.name.localeCompare(b.name, 'en-GB')) : [];
  const kinds = p.sites ? Object.keys(KIND_LABELS).filter((k) => p.sites?.sites.some((s) => s.kind === k)) : [];
  return (
    <div class="layers">
      {p.children}
      {p.clustersFailed ? (
        <p class="layer">Clusters could not be loaded.</p>
      ) : (
        p.clusters && (
          <fieldset class="layer">
            <legend>Clusters</legend>
            <label class="choice">
              <input type="checkbox" checked={p.showClusters} onChange={(e) => p.onShowClusters(checked(e))} /> Show cluster areas on the map
            </label>
            <p class="picker">
              <label for="cluster-pick">Companies in a cluster</label>
              <select id="cluster-pick" value={p.cluster?.id ?? ''} onChange={(e) => p.onCluster(chosen(e))}>
                <option value="">No cluster chosen</option>
                {sorted.map((c) => (
                  <option key={c.id} value={c.id}>
                    {optionLabel(c)}
                  </option>
                ))}
              </select>
            </p>
            {p.cluster && (
              <p class="layer-note">
                {p.memberCount != null
                  ? `Showing the ${p.memberCount === 1 ? 'company' : `${p.memberCount} companies`} Tally records as members of ${p.cluster.full}.`
                  : 'Tally does not yet record which companies belong to this cluster, so the companies are not narrowed.'}
              </p>
            )}
            {p.legend && <ClusterMapLegend entries={p.legend} chosen={p.cluster?.id ?? null} onTop={p.onTop} onOnTop={p.onOnTop} onChoose={(id) => p.onCluster(id === p.cluster?.id ? null : id)} />}
            <p class="layer-note">
              <a href="/events">See all upcoming cluster events</a>
            </p>
            <p class="layer-credit">
              Cluster areas: Office for National Statistics boundaries,{' '}
              <a href={p.licenceUrl ?? OGL} rel="noopener noreferrer">
                Open Government Licence v3.0
              </a>
              . Contains OS data © Crown copyright and database right 2025. Areas are approximate.
            </p>
          </fieldset>
        )
      )}
      {p.sitesFailed ? (
        <p class="layer">Defence sites could not be loaded.</p>
      ) : (
        p.sites && (
          <fieldset class="layer">
            <legend>Defence sites</legend>
            <label class="choice">
              <input type="checkbox" checked={p.showSites} onChange={(e) => p.onShowSites(checked(e))} /> Show defence sites on the map
            </label>
            <p class="picker">
              <label for="site-pick">Companies near a site</label>
              <select id="site-pick" value={p.site?.id ?? ''} onChange={(e) => p.onSite(chosen(e))}>
                <option value="">No site chosen</option>
                {kinds.map((k) => (
                  <optgroup key={k} label={KIND_LABELS[k]}>
                    {p.sites?.sites
                      .filter((s) => s.kind === k)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </p>
            {p.site && (
              <p class="layer-note">
                {p.site.name}: location from the{' '}
                <a href={p.site.source.url} rel="noopener noreferrer">
                  Wikipedia article {p.site.source.title}
                </a>
                . Set the distance with Within, beside the search.
              </p>
            )}
            <p class="layer-credit">
              {p.sites.sites.length} widely published sites, each checked against its source. Locations from Wikipedia contributors,{' '}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener noreferrer">
                CC BY-SA 4.0
              </a>
              .
            </p>
          </fieldset>
        )
      )}
    </div>
  );
}
