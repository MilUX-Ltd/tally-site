// The heatmap. MapLibre draws OpenFreeMap tiles; companies are binned into H3
// hexagons in the browser and coloured by count. Above PIN_ZOOM the hexagons
// give way to clustered pins. H3 loads after the map has started on its
// tiles, to keep the JavaScript needed before tiles small.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoJSONSource, Map as MlMap, MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BRAND_SCALE, colourScale, type LegendEntry } from '../lib/colour';
import { isLocated } from '../lib/filters';
import { ATTRIBUTION, FONT, STYLE_URL, UK_BOUNDS } from '../lib/map-config';
import type { Company } from '../lib/types';

export type Binning = typeof import('../lib/binning');

export interface MapPosition {
  zoom: number;
  lat: number;
  lon: number;
}

interface Props {
  companies: Company[];
  selectedCell: string | null;
  onSelectCell: (cell: string) => void;
  onSelectIds: (ids: string[]) => void;
  onBinning: (binning: Binning) => void;
  initialPosition?: MapPosition | null;
  onMove?: (position: MapPosition) => void;
  onMapReady?: (map: MlMap) => void;
}

const PIN_COLOUR = '#113308';
const CLUSTER_COLOUR = '#A35C17';
const SELECTED_COLOUR = '#113308';

function pointsGeoJSON(companies: Company[]) {
  return {
    type: 'FeatureCollection' as const,
    features: companies.filter(isLocated).map((c) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
      properties: { id: c.id, name: c.name },
    })),
  };
}

export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const binningRef = useRef<Binning | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const lastResolution = useRef<number>(-1);
  const [legend, setLegend] = useState<LegendEntry[]>([]);
  const [pins, setPins] = useState(false);
  const [failed, setFailed] = useState(false);

  const draw = () => {
    const map = mapRef.current;
    const binning = binningRef.current;
    const el = container.current;
    if (!map || !binning || !el || !map.getSource('hexes')) return;
    const { companies } = propsRef.current;
    const resolution = binning.resolutionForZoom(map.getZoom());
    lastResolution.current = resolution;
    const bins = binning.binCompanies(companies, resolution);
    const scale = colourScale(bins.reduce((m, b) => Math.max(m, b.count), 0));
    el.dataset.ready = 'false';
    (map.getSource('hexes') as GeoJSONSource).setData(binning.binsToGeoJSON(bins, scale.colourFor));
    (map.getSource('points') as GeoJSONSource).setData(pointsGeoJSON(companies));
    setLegend(bins.length ? scale.legend : []);
    map.once('idle', () => {
      el.dataset.ready = 'true';
    });
  };

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    (async () => {
      try {
        const [maplibregl, { default: workerUrl }] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
        ]);
        if (cancelled || !container.current) return;
        maplibregl.setWorkerUrl(workerUrl);
        const start = propsRef.current.initialPosition;
        const m = new maplibregl.Map({
          container: container.current,
          style: STYLE_URL,
          ...(start ? { center: [start.lon, start.lat] as [number, number], zoom: start.zoom } : { bounds: UK_BOUNDS }),
          minZoom: 3,
          maxZoom: 15,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: { compact: false, customAttribution: ATTRIBUTION },
        });
        map = m;
        m.touchZoomRotate.disableRotation();
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = m;
        // Lets journey tests place clicks on the map; nothing else reads it.
        Object.defineProperty(container.current, 'tallyMap', { value: m, configurable: true });

        m.on('load', async () => {
          m.resize();
          if (!start) m.fitBounds(UK_BOUNDS, { padding: 16, animate: false });
          m.addSource('hexes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addSource('points', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterRadius: 40,
            clusterMaxZoom: 14,
          });
          const { PIN_ZOOM } = await import('../lib/binning');
          m.addLayer({
            id: 'hex-fill',
            type: 'fill',
            source: 'hexes',
            maxzoom: PIN_ZOOM,
            paint: { 'fill-color': ['get', 'colour'], 'fill-opacity': 0.72 },
          });
          m.addLayer({
            id: 'hex-line',
            type: 'line',
            source: 'hexes',
            maxzoom: PIN_ZOOM,
            paint: { 'line-color': '#F7F6EB', 'line-width': 0.8 },
          });
          m.addLayer({
            id: 'hex-selected',
            type: 'line',
            source: 'hexes',
            maxzoom: PIN_ZOOM,
            filter: ['==', ['get', 'cell'], propsRef.current.selectedCell ?? ''],
            paint: { 'line-color': SELECTED_COLOUR, 'line-width': 3 },
          });
          m.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'points',
            minzoom: PIN_ZOOM,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': CLUSTER_COLOUR,
              'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
              'circle-stroke-color': '#F7F6EB',
              'circle-stroke-width': 2,
            },
          });
          m.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'points',
            minzoom: PIN_ZOOM,
            filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FONT, 'text-size': 13 },
            paint: { 'text-color': '#FFFFFF' },
          });
          m.addLayer({
            id: 'pins',
            type: 'circle',
            source: 'points',
            minzoom: PIN_ZOOM,
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': PIN_COLOUR,
              'circle-radius': 7,
              'circle-stroke-color': '#F7F6EB',
              'circle-stroke-width': 2,
            },
          });

          const first = (features?: MapGeoJSONFeature[]) => features?.[0]?.properties ?? {};
          m.on('click', 'hex-fill', (e) => {
            const cell = first(e.features).cell;
            if (typeof cell === 'string') propsRef.current.onSelectCell(cell);
          });
          m.on('click', 'clusters', async (e) => {
            const clusterId = first(e.features).cluster_id;
            if (typeof clusterId !== 'number') return;
            const leaves = await (m.getSource('points') as GeoJSONSource).getClusterLeaves(clusterId, 10_000, 0);
            propsRef.current.onSelectIds(leaves.map((f) => String(f.properties?.id)));
          });
          m.on('click', 'pins', (e) => {
            const id = first(e.features).id;
            if (typeof id === 'string') propsRef.current.onSelectIds([id]);
          });
          for (const layer of ['hex-fill', 'clusters', 'pins']) {
            m.on('mouseenter', layer, () => {
              m.getCanvas().style.cursor = 'pointer';
            });
            m.on('mouseleave', layer, () => {
              m.getCanvas().style.cursor = '';
            });
          }
          m.on('zoomend', () => {
            setPins(m.getZoom() >= PIN_ZOOM);
            if (binningRef.current && binningRef.current.resolutionForZoom(m.getZoom()) !== lastResolution.current) draw();
          });
          m.on('moveend', () => {
            const c = m.getCenter();
            propsRef.current.onMove?.({ zoom: m.getZoom(), lat: c.lat, lon: c.lng });
          });
          setPins(m.getZoom() >= PIN_ZOOM);

          // H3 loads once the map is running.
          const binning = await import('../lib/binning');
          if (cancelled) return;
          binningRef.current = binning;
          propsRef.current.onBinning(binning);
          propsRef.current.onMapReady?.(m);
          draw();
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    draw();
  }, [props.companies]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('hex-selected')) map.setFilter('hex-selected', ['==', ['get', 'cell'], props.selectedCell ?? '']);
  }, [props.selectedCell]);

  return (
    <div class="map-wrap">
      <div id="tally-map" class="map" ref={container} role="region" aria-label="Map of the companies that match the filters">
        {failed && (
          <p class="map-failed">The map cannot be shown in this browser. Every company is in the list below.</p>
        )}
      </div>
      <div class="legend">
        <h2 id="legend-heading">Companies per hexagon</h2>
        {legend.length > 0 ? (
          <ul aria-labelledby="legend-heading">
            {legend.map((entry) => (
              <li key={entry.label}>
                <span class={`swatch swatch-${BRAND_SCALE.indexOf(entry.colour)}`} aria-hidden="true" />
                {entry.label}
              </li>
            ))}
          </ul>
        ) : (
          <p>No companies with a location match these filters.</p>
        )}
        <p class="legend-note">
          {pins
            ? 'Zoomed in: each pin is a company, and numbered circles group companies close together.'
            : 'Zoom in to see individual companies. Select a hexagon to list its companies.'}
        </p>
      </div>
    </div>
  );
}
