// The heatmap. MapLibre draws OpenFreeMap tiles; companies are binned into H3
// hexagons in the browser and coloured by count. Above PIN_ZOOM the hexagons
// give way to clustered pins. H3 loads after the map has started on its
// tiles, to keep the JavaScript needed before tiles small.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BRAND_SCALE, colourScale, type LegendEntry } from '../lib/colour';
import { isLocated } from '../lib/filters';
import { ATTRIBUTION, FONT, STYLE_URL, UK_BOUNDS } from '../lib/map-config';
import type { Site } from '../lib/sites';
import type { Company } from '../lib/types';
import type { Bbox, MapPosition } from '../lib/url-state';

export type Binning = typeof import('../lib/binning');
type GeoData = Parameters<GeoJSONSource['setData']>[0];

export type { MapPosition };

interface Props {
  companies: Company[];
  /** Defence sites to draw, or null for none. */
  sites?: Site[] | null;
  /** The chosen site, drawn larger. */
  chosenSite?: string | null;
  /** A distance ring around the chosen site or place, as [lon, lat] points. */
  ring?: number[][] | null;
  /** A typed place (near-me search), drawn at the ring's centre. */
  place?: { lat: number; lon: number } | null;
  /** Cluster outlines to draw, each with its colour and whether it is chosen. */
  clusterRegions?: { type: 'FeatureCollection'; features: unknown[] } | null;
  /** One marker per cluster with upcoming events. */
  clusterEvents?: { type: 'FeatureCollection'; features: unknown[] } | null;
  /** The chosen cluster's bounds, brought into view when the choice changes. */
  clusterFocus?: { key: string; bounds: [number, number, number, number] } | null;
  /** One name label per cluster, drawn while the cluster map is on. */
  clusterLabels?: { type: 'FeatureCollection'; features: unknown[] } | null;
  /** The cluster map: every area drawn strongly and labelled, companies faded behind. */
  clusterMap?: boolean;
  /** Keep companies at full strength over the cluster map. */
  companiesOnTop?: boolean;
  onClusterMap?: (on: boolean) => void;
  /** An area on the cluster map was selected. */
  onSelectCluster?: (id: string) => void;
  /** Draw hexagons at this resolution whatever the zoom (capability overlap places). */
  fixedResolution?: number | null;
  selectedCell: string | null;
  onSelectCell: (cell: string) => void;
  onSelectIds: (ids: string[]) => void;
  onBinning: (binning: Binning) => void;
  initialPosition?: MapPosition | null;
  onMove?: (position: MapPosition) => void;
  onMapReady?: (map: MlMap) => void;
  /** The area taken from or drawn on the map, outlined when set. */
  area?: Bbox | null;
  onArea?: (area: Bbox) => void;
}

const bboxPolygon = ([w, s, e, n]: Bbox) => ({
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    },
  ],
});
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const round5 = (n: number) => Number(n.toFixed(5));
const SITE_COLOUR = '#586F7C';
const RING_COLOUR = '#A35C17';

function sitesGeoJSON(sites: Site[] | null | undefined, chosen: string | null | undefined) {
  return {
    type: 'FeatureCollection' as const,
    features: (sites ?? []).map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, chosen: s.id === chosen },
    })),
  };
}

function placeGeoJSON(place: { lat: number; lon: number } | null | undefined) {
  if (!place) return EMPTY;
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [place.lon, place.lat] } }],
  };
}

function ringGeoJSON(ring: number[][] | null | undefined) {
  if (!ring) return { type: 'FeatureCollection' as const, features: [] };
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring] } }],
  };
}

const PIN_COLOUR = '#113308';
const LABEL_TEXT = '#1A1A1A';
const HEX_OPACITY = 0.72;
const FADED = 0.1;

/** Company layers fade while the cluster map is on, unless companies are kept on top. */
const isFaded = (p: Pick<Props, 'clusterMap' | 'companiesOnTop'>) => Boolean(p.clusterMap && !p.companiesOnTop);

/** Areas of clusters not yet live are drawn as a dashed outline only. */
const LIVE: ExpressionSpecification = ['coalesce', ['get', 'live'], true];
const AREA_COLOUR: ExpressionSpecification = ['coalesce', ['get', 'mapColour'], ['get', 'colour']];

function regionPaint(clusterMap: boolean): Record<'fill-opacity' | 'line-width', ExpressionSpecification> {
  return {
    'fill-opacity': ['case', ['!', LIVE], ['case', ['get', 'chosen'], 0.12, 0], ['get', 'chosen'], clusterMap ? 0.55 : 0.22, clusterMap ? 0.4 : 0.12],
    'line-width': ['case', ['get', 'chosen'], clusterMap ? 4 : 3.5, clusterMap ? 2 : 1.5],
  };
}

/** A round marker as a signed distance field, so each can take its cluster's colour and a halo. */
function eventDot() {
  const size = 40;
  const radius = 11;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) - radius;
      data[(y * size + x) * 4 + 3] = Math.max(0, Math.min(255, Math.round(255 * (0.75 - d / 8))));
    }
  }
  return { width: size, height: size, data };
}

/** Opacity of each company layer's paint properties. */
type PaintName = Parameters<MlMap['setPaintProperty']>[1];

function companyPaint(faded: boolean): Array<[string, PaintName, number]> {
  const o = faded ? FADED : 1;
  return [
    ['hex-fill', 'fill-opacity', faded ? FADED : HEX_OPACITY],
    ['hex-line', 'line-opacity', o],
    ['clusters', 'circle-opacity', o],
    ['clusters', 'circle-stroke-opacity', o],
    ['cluster-count', 'text-opacity', o],
    ['pins', 'circle-opacity', o],
    ['pins', 'circle-stroke-opacity', o],
  ];
}
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
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;
  const [loaded, setLoaded] = useState(false);

  const draw = () => {
    const map = mapRef.current;
    const binning = binningRef.current;
    const el = container.current;
    if (!map || !binning || !el || !map.getSource('hexes')) return;
    const { companies } = propsRef.current;
    const resolution = propsRef.current.fixedResolution ?? binning.resolutionForZoom(map.getZoom());
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
          // Cluster areas sit under everything else. Higher-ranked areas
          // (smaller ones, and the chosen one) draw on top where areas overlap.
          const regionStyle = regionPaint(Boolean(propsRef.current.clusterMap));
          m.addSource('cluster-regions', { type: 'geojson', data: (propsRef.current.clusterRegions ?? EMPTY) as GeoData });
          m.addLayer({
            id: 'cluster-fill',
            type: 'fill',
            source: 'cluster-regions',
            layout: { 'fill-sort-key': ['get', 'rank'] },
            paint: { 'fill-color': AREA_COLOUR, 'fill-opacity': regionStyle['fill-opacity'] },
          });
          m.addLayer({
            id: 'cluster-line',
            type: 'line',
            source: 'cluster-regions',
            filter: ['==', LIVE, true],
            layout: { 'line-sort-key': ['get', 'rank'] },
            paint: { 'line-color': AREA_COLOUR, 'line-width': regionStyle['line-width'] },
          });
          m.addLayer({
            id: 'cluster-line-not-live',
            type: 'line',
            source: 'cluster-regions',
            filter: ['==', LIVE, false],
            layout: { 'line-sort-key': ['get', 'rank'] },
            paint: { 'line-color': AREA_COLOUR, 'line-width': regionStyle['line-width'], 'line-dasharray': [2, 1.5] },
          });
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

          m.addSource('area', { type: 'geojson', data: propsRef.current.area ? bboxPolygon(propsRef.current.area) : EMPTY });
          m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#586F7C', 'fill-opacity': 0.12 } });
          m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#113308', 'line-width': 2, 'line-dasharray': [2, 1] } });

          m.addSource('site-ring', { type: 'geojson', data: ringGeoJSON(propsRef.current.ring) });
          m.addLayer({ id: 'site-ring-fill', type: 'fill', source: 'site-ring', paint: { 'fill-color': RING_COLOUR, 'fill-opacity': 0.06 } });
          m.addLayer({ id: 'site-ring-line', type: 'line', source: 'site-ring', paint: { 'line-color': RING_COLOUR, 'line-width': 2.5 } });
          m.addSource('near-place', { type: 'geojson', data: placeGeoJSON(propsRef.current.place) });
          m.addLayer({
            id: 'near-place-point',
            type: 'circle',
            source: 'near-place',
            paint: { 'circle-color': RING_COLOUR, 'circle-radius': 7, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 },
          });
          m.addSource('sites', { type: 'geojson', data: sitesGeoJSON(propsRef.current.sites, propsRef.current.chosenSite) });
          m.addLayer({
            id: 'site-points',
            type: 'circle',
            source: 'sites',
            paint: {
              'circle-color': ['case', ['get', 'chosen'], RING_COLOUR, SITE_COLOUR],
              'circle-radius': ['case', ['get', 'chosen'], 8, 5],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
          });

          // Cluster names: dark text on a white halo, beside the event marker.
          // Labels that would collide are left out at that zoom; every
          // cluster is in the legend.
          m.addSource('cluster-labels', { type: 'geojson', data: (propsRef.current.clusterLabels ?? EMPTY) as GeoData });
          m.addLayer({
            id: 'cluster-label',
            type: 'symbol',
            source: 'cluster-labels',
            layout: {
              'text-field': ['get', 'name'],
              'text-font': FONT,
              'text-size': 13,
              'text-max-width': 8,
              'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
              'text-radial-offset': 1.2,
              'text-justify': 'auto',
            },
            paint: { 'text-color': LABEL_TEXT, 'text-halo-color': '#FFFFFF', 'text-halo-width': 2 },
          });

          // Event markers sit above the labels, so they are placed first and
          // the labels move aside rather than being covered.
          m.addImage('event-dot', eventDot(), { sdf: true });
          m.addSource('cluster-events', { type: 'geojson', data: (propsRef.current.clusterEvents ?? EMPTY) as GeoData });
          m.addLayer({
            id: 'cluster-event-points',
            type: 'symbol',
            source: 'cluster-events',
            layout: {
              'icon-image': 'event-dot',
              'icon-allow-overlap': true,
              'text-field': ['to-string', ['get', 'count']],
              'text-font': FONT,
              'text-size': 12,
              'text-allow-overlap': true,
            },
            paint: {
              'icon-color': AREA_COLOUR,
              'icon-halo-color': '#FFFFFF',
              'icon-halo-width': 2,
              'text-color': '#FFFFFF',
              'text-halo-color': LABEL_TEXT,
              'text-halo-width': 1.5,
            },
          });
          for (const [layer, name, value] of companyPaint(isFaded(propsRef.current))) m.setPaintProperty(layer, name, value);

          // Drawing a rectangle: press, drag and release while "Draw an area" is on.
          let dragFrom: [number, number] | null = null;
          const rect = (a: [number, number], b: [number, number]): Bbox => [
            round5(Math.min(a[0], b[0])),
            round5(Math.min(a[1], b[1])),
            round5(Math.max(a[0], b[0])),
            round5(Math.max(a[1], b[1])),
          ];
          m.on('mousedown', (e) => {
            if (!drawingRef.current) return;
            e.preventDefault();
            dragFrom = [e.lngLat.lng, e.lngLat.lat];
          });
          m.on('mousemove', (e) => {
            if (!drawingRef.current || !dragFrom) return;
            (m.getSource('area') as GeoJSONSource).setData(bboxPolygon(rect(dragFrom, [e.lngLat.lng, e.lngLat.lat])));
          });
          m.on('mouseup', (e) => {
            if (!drawingRef.current || !dragFrom) return;
            const box = rect(dragFrom, [e.lngLat.lng, e.lngLat.lat]);
            dragFrom = null;
            setDrawing(false);
            if (box[0] < box[2] && box[1] < box[3]) propsRef.current.onArea?.(box);
          });

          const first = (features?: MapGeoJSONFeature[]) => features?.[0]?.properties ?? {};
          m.on('click', 'hex-fill', (e) => {
            if (drawingRef.current || isFaded(propsRef.current)) return;
            const cell = first(e.features).cell;
            if (typeof cell === 'string') propsRef.current.onSelectCell(cell);
          });
          m.on('click', 'clusters', async (e) => {
            if (isFaded(propsRef.current)) return;
            const clusterId = first(e.features).cluster_id;
            if (typeof clusterId !== 'number') return;
            const leaves = await (m.getSource('points') as GeoJSONSource).getClusterLeaves(clusterId, 10_000, 0);
            propsRef.current.onSelectIds(leaves.map((f) => String(f.properties?.id)));
          });
          m.on('click', 'pins', (e) => {
            if (isFaded(propsRef.current)) return;
            const id = first(e.features).id;
            if (typeof id === 'string') propsRef.current.onSelectIds([id]);
          });
          // On the cluster map, selecting an area chooses its cluster; where
          // areas overlap, the one drawn on top. With companies on top, a
          // company under the pointer takes the click instead.
          m.on('click', 'cluster-fill', (e) => {
            const p = propsRef.current;
            if (drawingRef.current || !p.clusterMap) return;
            if (!isFaded(p) && m.queryRenderedFeatures(e.point, { layers: ['hex-fill', 'clusters', 'pins'].filter((l) => m.getLayer(l)) }).length) return;
            const top = [...(e.features ?? [])].sort((a, b) => Number(b.properties?.rank ?? 0) - Number(a.properties?.rank ?? 0))[0];
            const id = top?.properties?.id;
            if (typeof id === 'string') p.onSelectCluster?.(id);
          });
          for (const layer of ['hex-fill', 'clusters', 'pins', 'cluster-fill']) {
            m.on('mouseenter', layer, () => {
              const p = propsRef.current;
              const clickable = layer === 'cluster-fill' ? Boolean(p.clusterMap) : !isFaded(p);
              if (clickable) m.getCanvas().style.cursor = 'pointer';
            });
            m.on('mouseleave', layer, () => {
              m.getCanvas().style.cursor = '';
            });
          }
          m.on('zoomend', () => {
            setPins(m.getZoom() >= PIN_ZOOM);
            const b = binningRef.current;
            if (b && (propsRef.current.fixedResolution ?? b.resolutionForZoom(m.getZoom())) !== lastResolution.current) draw();
          });
          m.on('moveend', () => {
            const c = m.getCenter();
            propsRef.current.onMove?.({ zoom: m.getZoom(), lat: c.lat, lon: c.lng });
          });
          setPins(m.getZoom() >= PIN_ZOOM);
          setLoaded(true);

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
  }, [props.companies, props.fixedResolution]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('hex-selected')) map.setFilter('hex-selected', ['==', ['get', 'cell'], props.selectedCell ?? '']);
  }, [props.selectedCell]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (drawing) map.dragPan.disable();
    else map.dragPan.enable();
    container.current?.classList.toggle('drawing', drawing);
  }, [drawing, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource('area') as GeoJSONSource | undefined;
    if (loaded && source) source.setData(props.area ? bboxPolygon(props.area) : EMPTY);
  }, [props.area, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource('sites') as GeoJSONSource | undefined;
    if (loaded && source) source.setData(sitesGeoJSON(props.sites, props.chosenSite));
  }, [props.sites, props.chosenSite, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource('near-place') as GeoJSONSource | undefined;
    if (loaded && source) source.setData(placeGeoJSON(props.place));
  }, [props.place?.lat, props.place?.lon, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource('cluster-regions') as GeoJSONSource | undefined;
    if (loaded && source) source.setData((props.clusterRegions ?? EMPTY) as GeoData);
  }, [props.clusterRegions, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource('cluster-labels') as GeoJSONSource | undefined;
    if (loaded && source) source.setData((props.clusterLabels ?? EMPTY) as GeoData);
  }, [props.clusterLabels, loaded]);

  const faded = isFaded(props);
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map?.getLayer('cluster-label')) return;
    const style = regionPaint(Boolean(props.clusterMap));
    map.setPaintProperty('cluster-fill', 'fill-opacity', style['fill-opacity']);
    map.setPaintProperty('cluster-line', 'line-width', style['line-width']);
    map.setPaintProperty('cluster-line-not-live', 'line-width', style['line-width']);
    for (const [layer, name, value] of companyPaint(faded)) map.setPaintProperty(layer, name, value);
  }, [props.clusterMap, faded, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource('cluster-events') as GeoJSONSource | undefined;
    if (loaded && source) source.setData((props.clusterEvents ?? EMPTY) as GeoData);
  }, [props.clusterEvents, loaded]);

  // Bring a newly chosen cluster into view.
  const focusKey = props.clusterFocus?.key ?? '';
  const lastFocusKey = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    if (lastFocusKey.current === focusKey) return;
    lastFocusKey.current = focusKey;
    const focus = propsRef.current.clusterFocus;
    if (focus) map.fitBounds(focus.bounds, { padding: 24, animate: false });
  }, [focusKey, loaded]);

  // Draw the ring, and bring it into view when the site or radius changes.
  const ringKey = props.ring ? `${props.chosenSite}:${props.ring[0].join(',')}` : '';
  const lastRingKey = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('site-ring') as GeoJSONSource | undefined;
    if (!loaded || !map || !source) return;
    source.setData(ringGeoJSON(props.ring));
    const first = lastRingKey.current === null;
    lastRingKey.current = ringKey;
    if (props.ring && !(first && propsRef.current.initialPosition)) {
      const lons = props.ring.map((p) => p[0]);
      const lats = props.ring.map((p) => p[1]);
      map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], { padding: 24, animate: false });
    }
  }, [ringKey, loaded]);

  const useCurrentView = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const clampLat = (n: number) => Math.max(-85, Math.min(85, n));
    const clampLon = (n: number) => Math.max(-180, Math.min(180, n));
    props.onArea?.([round5(clampLon(b.getWest())), round5(clampLat(b.getSouth())), round5(clampLon(b.getEast())), round5(clampLat(b.getNorth()))]);
  };

  return (
    <div class="map-wrap">
      {props.onArea && (
        <div class="map-tools">
          <button type="button" class="secondary" disabled={!loaded} onClick={useCurrentView}>
            Use the map's current view
          </button>
          <button
            type="button"
            class="secondary"
            disabled={!loaded}
            aria-pressed={drawing}
            onClick={() => setDrawing(!drawing)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDrawing(false);
            }}
          >
            Draw an area
          </button>
          {props.onClusterMap && (
            <button type="button" class="secondary" aria-pressed={Boolean(props.clusterMap)} onClick={() => props.onClusterMap?.(!props.clusterMap)}>
              Cluster map
            </button>
          )}
          {drawing && <span role="status">Press and drag on the map to draw a rectangle.</span>}
        </div>
      )}
      <div id="tally-map" class="map" ref={container} role="region" aria-label="Map of the companies that match the filters">
        {failed && (
          <p class="map-failed">The map cannot be shown in this browser. Every company is in the list below.</p>
        )}
      </div>
      <div class="legend">
        <h2 id="legend-heading">{props.fixedResolution != null ? 'Companies in places where all chosen capabilities overlap' : 'Companies per hexagon'}</h2>
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
