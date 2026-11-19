// Defence sites: show them on the map, pick one and a radius to see the
// companies within reach. The site, radius and overlay are held in the URL.
import { KIND_LABELS, RADII, type Radius, type Site, type SitesData } from '../lib/sites';

interface Props {
  data: SitesData | null;
  failed: boolean;
  show: boolean;
  site: Site | null;
  radius: Radius;
  onShow: (show: boolean) => void;
  onSite: (id: string | null) => void;
  onRadius: (radius: Radius) => void;
}

export default function SitesPanel({ data, failed, show, site, radius, onShow, onSite, onRadius }: Props) {
  if (failed) return <p class="sites-panel">Defence sites could not be loaded.</p>;
  if (!data) return null;
  const kinds = Object.keys(KIND_LABELS).filter((k) => data.sites.some((s) => s.kind === k));
  return (
    <fieldset class="sites-panel">
      <legend>Defence sites</legend>
      <label class="choice">
        <input type="checkbox" checked={show} onChange={(e) => onShow((e.currentTarget as HTMLInputElement).checked)} /> Show defence sites on the map
      </label>
      <div class="sites-pickers">
        <p>
          <label for="site-pick">Companies near a site</label>
          <select id="site-pick" value={site?.id ?? ''} onChange={(e) => onSite((e.currentTarget as HTMLSelectElement).value || null)}>
            <option value="">No site chosen</option>
            {kinds.map((k) => (
              <optgroup key={k} label={KIND_LABELS[k]}>
                {data.sites
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
        <p>
          <label for="site-radius">Within</label>
          <select id="site-radius" value={String(radius)} onChange={(e) => onRadius(Number((e.currentTarget as HTMLSelectElement).value) as Radius)}>
            {RADII.map((r) => (
              <option key={r} value={String(r)}>
                {r} miles
              </option>
            ))}
          </select>
        </p>
      </div>
      {site && (
        <p class="site-source">
          {site.name}: location from the{' '}
          <a href={site.source.url} rel="noopener noreferrer">
            Wikipedia article {site.source.title}
          </a>
          .
        </p>
      )}
      <p class="sites-attribution">
        {data.sites.length} widely published sites, each checked against its source. Locations from Wikipedia contributors, licensed{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener noreferrer">
          CC BY-SA 4.0
        </a>
        .
      </p>
    </fieldset>
  );
}
