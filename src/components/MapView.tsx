// The map. MapLibre draws OpenFreeMap tiles, calmed to land, sea, borders and
// place names; companies are binned into H3 hexagons in the browser and drawn
// as columns (3D, the default) or flat hexagons, coloured on the data ramp
// against the busiest area in view. Above PIN_ZOOM the hexagons give way to
// clustered pins. H3 loads after the map has started on its tiles, to keep the
// JavaScript needed before tiles small.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'preact/hooks';
import { isLocated } from '../lib/filters';
import { ATTRIBUTION, FONT, STYLE_URL, UK_BOUNDS } from '../lib/map-config';
import type { HexCollection } from '../lib/binning';
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
  /** One name label per cluster, drawn while the cluster map is on. */
  clusterLabels?: { type: 'FeatureCollection'; features: unknown[] } | null;
  /** The cluster map: every area drawn strongly and labelled, companies faded behind. */
  clusterMap?: boolean;
  /** Keep companies at full strength over the cluster map. */
  companiesOnTop?: boolean;
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
  /** Columns (3D) or flat hexagons. */
  three: boolean;
  /** Room taken by the panels over the map, so the camera frames what is left. */
  padding: Padding;
  /** What the camera should frame: bounds, or the whole UK. Null until the page has settled. */
  focus: { key: string; bounds: Bbox | null } | null;
  /** Whether a rectangle is being drawn. */
  drawing: boolean;
  onDrawing: (drawing: boolean) => void;
  /** The List view covers the map: it is taken out of reach. */
  hidden?: boolean;
  /** The Money view: regions shaded by contract value and arcs to overseas countries; company shading is hidden. */
  money?: MoneyOverlay | null;
  /** While set, the map zooms out to these bounds to show the overseas money. */
  overseasBounds?: Bbox | null;
  /** Lets the page ask for the area in view ("Search this area"). */
  api?: { current: MapApi | null };
}

export interface MoneyOverlay {
  /** The year shown: a calendar year for contract awards, a financial year ("2025/26") for MOD spend. */
  year: string;
  /** Contract awards, or MOD's official spend with industry. */
  measure: 'awards' | 'spend';
  regions: unknown | null;
  arcs: unknown;
  ends: unknown;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapApi {
  /** The area around the centre of the view, clear of the panels. */
  viewArea: () => Bbox | null;
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
const FOREST = '#113308';
const PAPER = '#F5F4EF';
const SITE_COLOUR = FOREST;
const RING_COLOUR = FOREST;
/** The data ramp, low to high. */
export const RAMP = ['#F2D9A6', '#EDA552', '#E2611C', '#8A2B0A'] as const;
const RAMP_COLOUR: ExpressionSpecification = ['interpolate', ['linear'], ['get', 't'], 0, RAMP[0], 0.3, RAMP[1], 0.6, RAMP[2], 1, RAMP[3]];
/** Column height in metres for one company, by hexagon resolution; heights grow with the square root of the count. */
const COLUMN_HEIGHT: Record<number, number> = { 3: 18000, 4: 9000, 5: 4600, 6: 2200, 7: 1000 };
const COLUMN_OPACITY = 0.92;
const PITCH = 50;
const BEARING = -12;
const UK_CENTRE: [number, number] = [-3.4, 54.7];
const UK_ZOOM = 5.25;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

const PIN_COLOUR = FOREST;
const LABEL_TEXT = '#0C1510';
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
    ['hex-3d', 'fill-extrusion-opacity', faded ? FADED : COLUMN_OPACITY],
    ['hex-line', 'line-opacity', o],
    ['clusters', 'circle-opacity', o],
    ['clusters', 'circle-stroke-opacity', o],
    ['cluster-count', 'text-opacity', o],
    ['pins', 'circle-opacity', o],
    ['pins', 'circle-stroke-opacity', o],
  ];
}
const CLUSTER_COLOUR = '#A35C17';
const COMPANY_LAYERS = ['hex-fill', 'hex-3d', 'clusters', 'pins'];
const MONEY_LAYERS = ['money-fill', 'money-line', 'money-arc', 'money-end'];
/** Regions with no money (t below 0) are left unshaded. */
const MONEY_FILL: ExpressionSpecification = ['case', ['<', ['get', 't'], 0], PAPER, ['interpolate', ['linear'], ['get', 't'], 0, RAMP[0], 0.3, RAMP[1], 0.6, RAMP[2], 1, RAMP[3]]];
const ARC_COLOUR = '#A35C17';

/** Company shading shows unless the Money view is open; columns in 3D, flat hexagons otherwise. */
function companyVisibility(three: boolean, money: boolean): Array<[string, 'visible' | 'none']> {
  const on = (show: boolean) => (show && !money ? 'visible' : 'none');
  return [
    ['hex-3d', on(three)],
    ['hex-fill', on(!three)],
    ['hex-line', on(!three)],
    ['hex-selected', on(!three)],
    ['clusters', on(true)],
    ['cluster-count', on(true)],
    ['pins', on(true)],
  ];
}
const SELECTED_COLOUR = FOREST;

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
  const [legend, setLegend] = useState<'loading' | 'empty' | 'shown'>('loading');
  const [pins, setPins] = useState(false);
  const [failed, setFailed] = useState(false);
  const drawingRef = useRef(false);
  drawingRef.current = props.drawing;
  const [loaded, setLoaded] = useState(false);
  // The last hexagons drawn, kept so a move can tell whether the busiest area in view has changed.
  const drawn = useRef<{ bins: Array<{ count: number; lon: number; lat: number }>; max: number }>({ bins: [], max: 0 });

  /** The largest count among hexagons in view, or among them all when none is. */
  const busiest = (bins: Array<{ count: number; lon: number; lat: number }>) => {
    const map = mapRef.current;
    const all = bins.reduce((m, b) => Math.max(m, b.count), 0);
    if (!map) return all;
    const bounds = map.getBounds();
    const inView = bins.filter((b) => bounds.contains([b.lon, b.lat])).reduce((m, b) => Math.max(m, b.count), 0);
    return inView || all;
  };

  const draw = () => {
    const map = mapRef.current;
    const binning = binningRef.current;
    const el = container.current;
    if (!map || !binning || !el || !map.getSource('hexes')) return;
    const { companies, selectedCell } = propsRef.current;
    const resolution = propsRef.current.fixedResolution ?? binning.resolutionForZoom(map.getZoom());
    lastResolution.current = resolution;
    const bins = binning.binCompanies(companies, resolution);
    const geo: HexCollection = binning.binsToGeoJSON(bins);
    const centres = geo.features.map((f) => {
      const ring = f.geometry.coordinates[0].slice(0, -1);
      return { count: f.properties.count, lon: ring.reduce((n, p) => n + p[0], 0) / ring.length, lat: ring.reduce((n, p) => n + p[1], 0) / ring.length };
    });
    const max = Math.max(1, busiest(centres));
    drawn.current = { bins: centres, max };
    const unit = COLUMN_HEIGHT[resolution] ?? COLUMN_HEIGHT[7];
    el.dataset.ready = 'false';
    (map.getSource('hexes') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: geo.features.map((f) => {
        const { cell, count } = f.properties;
        return { ...f, properties: { cell, count, t: Math.min(1, Math.sqrt(count / max)), height: Math.sqrt(count) * unit, on: cell === selectedCell } };
      }),
    } as GeoData);
    (map.getSource('points') as GeoJSONSource).setData(pointsGeoJSON(companies));
    setLegend(bins.length ? 'shown' : 'empty');
    map.once('idle', () => {
      el.dataset.ready = 'true';
    });
  };

  /** The camera for the whole UK in the room the panels leave. */
  const overview = (map: MlMap, padding: Padding) => {
    let fit: number | undefined;
    try {
      fit = map.cameraForBounds(UK_BOUNDS, { padding, bearing: 0 })?.zoom;
    } catch {
      fit = undefined;
    }
    return { center: UK_CENTRE, zoom: Math.max(3.6, Math.min(UK_ZOOM, (fit ?? 4.2) + 0.35)) };
  };

  /** Moves the camera to the focus: its bounds, or the UK. Flies unless told not to, or motion is reduced. */
  const frame = (instant: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const { focus, padding, three } = propsRef.current;
    let target = overview(map, padding);
    if (focus?.bounds) {
      const [w, s, e, n] = focus.bounds;
      const room = { top: padding.top + 24, right: padding.right + 24, bottom: padding.bottom + 24, left: padding.left + 24 };
      let zoom: number | undefined;
      try {
        zoom = map.cameraForBounds([w, s, e, n], { padding: room, bearing: 0 })?.zoom;
      } catch {
        zoom = undefined;
      }
      target = { center: [(w + e) / 2, (s + n) / 2], zoom: Math.min(11, (zoom ?? 7) - (three ? 0.15 : 0)) };
    }
    const camera = { ...target, pitch: three ? PITCH : 0, bearing: three ? BEARING : 0, padding };
    if (instant || reducedMotion()) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: 1400 });
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
        const three = propsRef.current.three;
        const m = new maplibregl.Map({
          container: container.current,
          style: STYLE_URL,
          center: start ? [start.lon, start.lat] : UK_CENTRE,
          zoom: start ? start.zoom : UK_ZOOM,
          pitch: three ? PITCH : 0,
          bearing: three ? BEARING : 0,
          minZoom: 3,
          maxZoom: 15,
          maxPitch: 60,
          attributionControl: { compact: false, customAttribution: ATTRIBUTION },
          // On a touch screen one finger scrolls the page past the map; two fingers move the map.
          cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
        });
        map = m;
        m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        mapRef.current = m;
        // Lets journey tests place clicks on the map; nothing else reads it.
        Object.defineProperty(container.current, 'tallyMap', { value: m, configurable: true });

        m.on('load', async () => {
          m.resize();
          // The first view: the position in the link, or the whole UK.
          if (start) m.jumpTo({ center: [start.lon, start.lat], zoom: start.zoom, padding: propsRef.current.padding });
          else frame(true);

          // A calm, light base: land, sea, borders and place names only.
          for (const l of m.getStyle().layers) {
            if (/road|highway|rail|bridge|tunnel|aeroway|building|poi|housenum|ferry|park|landuse|landcover|waterway/.test(l.id)) m.setLayoutProperty(l.id, 'visibility', 'none');
            else if (l.type === 'background') m.setPaintProperty(l.id, 'background-color', '#FBFAF6');
            else if (l.type === 'fill' && /water/.test(l.id)) m.setPaintProperty(l.id, 'fill-color', '#DCE3E2');
            else if (l.type === 'line' && /boundary/.test(l.id)) m.setPaintProperty(l.id, 'line-color', '#B9B8AE');
            else if (l.type === 'symbol') {
              if (/state|suburb|village|other|country_3|water/.test(l.id)) m.setLayoutProperty(l.id, 'visibility', 'none');
              else {
                m.setPaintProperty(l.id, 'text-color', '#3F4A42');
                m.setPaintProperty(l.id, 'text-halo-color', 'rgba(251,250,246,0.9)');
              }
            }
          }
          // Areas and columns sit under the place names.
          const under = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
          const { PIN_ZOOM } = await import('../lib/binning');
          if (cancelled) return;

          // Cluster areas sit under everything else. Higher-ranked areas
          // (smaller ones, and the chosen one) draw on top where areas overlap.
          const regionStyle = regionPaint(Boolean(propsRef.current.clusterMap));
          m.addSource('cluster-regions', { type: 'geojson', data: (propsRef.current.clusterRegions ?? EMPTY) as GeoData });
          m.addLayer(
            {
              id: 'cluster-fill',
              type: 'fill',
              source: 'cluster-regions',
              layout: { 'fill-sort-key': ['get', 'rank'] },
              paint: { 'fill-color': AREA_COLOUR, 'fill-opacity': regionStyle['fill-opacity'] },
            },
            under,
          );
          m.addLayer(
            {
              id: 'cluster-line',
              type: 'line',
              source: 'cluster-regions',
              filter: ['==', LIVE, true],
              layout: { 'line-sort-key': ['get', 'rank'] },
              paint: { 'line-color': AREA_COLOUR, 'line-width': regionStyle['line-width'] },
            },
            under,
          );
          m.addLayer(
            {
              id: 'cluster-line-not-live',
              type: 'line',
              source: 'cluster-regions',
              filter: ['==', LIVE, false],
              layout: { 'line-sort-key': ['get', 'rank'] },
              paint: { 'line-color': AREA_COLOUR, 'line-width': regionStyle['line-width'], 'line-dasharray': [2, 1.5] },
            },
            under,
          );

          m.addSource('area', { type: 'geojson', data: propsRef.current.area ? bboxPolygon(propsRef.current.area) : EMPTY });
          m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': FOREST, 'fill-opacity': 0.06 } }, under);
          m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': FOREST, 'line-width': 2, 'line-dasharray': [2, 1] } }, under);

          // The Money view: regions shaded by contract value, under the
          // companies and place names; arcs to overseas countries on top.
          const moneyOn = propsRef.current.money ? 'visible' : 'none';
          m.addSource('money-regions', { type: 'geojson', data: (propsRef.current.money?.regions ?? EMPTY) as GeoData });
          m.addLayer({ id: 'money-fill', type: 'fill', source: 'money-regions', layout: { visibility: moneyOn }, paint: { 'fill-color': MONEY_FILL, 'fill-opacity': 0.82 } }, under);
          m.addLayer({ id: 'money-line', type: 'line', source: 'money-regions', layout: { visibility: moneyOn }, paint: { 'line-color': '#FFFFFF', 'line-width': 1 } }, under);

          m.addSource('site-ring', { type: 'geojson', data: ringGeoJSON(propsRef.current.ring) });
          m.addLayer({ id: 'site-ring-fill', type: 'fill', source: 'site-ring', paint: { 'fill-color': RING_COLOUR, 'fill-opacity': 0.05 } }, under);
          m.addLayer({ id: 'site-ring-line', type: 'line', source: 'site-ring', paint: { 'line-color': RING_COLOUR, 'line-width': 1.5, 'line-dasharray': [3, 2] } }, under);

          m.addSource('hexes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addSource('points', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterRadius: 40,
            clusterMaxZoom: 14,
          });
          const flat = three ? 'none' : 'visible';
          m.addLayer(
            {
              id: 'hex-fill',
              type: 'fill',
              source: 'hexes',
              maxzoom: PIN_ZOOM,
              layout: { visibility: flat },
              paint: { 'fill-color': RAMP_COLOUR, 'fill-opacity': HEX_OPACITY },
            },
            under,
          );
          m.addLayer(
            {
              id: 'hex-line',
              type: 'line',
              source: 'hexes',
              maxzoom: PIN_ZOOM,
              layout: { visibility: flat },
              paint: { 'line-color': PAPER, 'line-width': 0.8 },
            },
            under,
          );
          m.addLayer(
            {
              id: 'hex-selected',
              type: 'line',
              source: 'hexes',
              maxzoom: PIN_ZOOM,
              layout: { visibility: flat },
              filter: ['==', ['get', 'cell'], propsRef.current.selectedCell ?? ''],
              paint: { 'line-color': SELECTED_COLOUR, 'line-width': 3 },
            },
            under,
          );
          m.addLayer(
            {
              id: 'hex-3d',
              type: 'fill-extrusion',
              source: 'hexes',
              maxzoom: PIN_ZOOM,
              layout: { visibility: three ? 'visible' : 'none' },
              paint: {
                'fill-extrusion-color': ['case', ['get', 'on'], SELECTED_COLOUR, RAMP_COLOUR],
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-opacity': COLUMN_OPACITY,
              },
            },
            under,
          );
          m.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'points',
            minzoom: PIN_ZOOM,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': CLUSTER_COLOUR,
              'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
              'circle-stroke-color': '#FFFFFF',
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
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
          });

          m.addSource('near-place', { type: 'geojson', data: placeGeoJSON(propsRef.current.place) });
          m.addLayer({
            id: 'near-place-point',
            type: 'circle',
            source: 'near-place',
            paint: { 'circle-color': RING_COLOUR, 'circle-radius': 6, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 },
          });
          m.addSource('sites', { type: 'geojson', data: sitesGeoJSON(propsRef.current.sites, propsRef.current.chosenSite) });
          m.addLayer({
            id: 'site-points',
            type: 'circle',
            source: 'sites',
            paint: {
              'circle-color': SITE_COLOUR,
              'circle-radius': ['case', ['get', 'chosen'], 7, 5],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
          });
          m.addLayer({
            id: 'site-name',
            type: 'symbol',
            source: 'sites',
            minzoom: 6.5,
            layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-max-width': 9 },
            paint: { 'text-color': SITE_COLOUR, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 },
          });

          // Cluster names: dark text on a white halo, centred on the area's
          // label point or moved just aside if that would collide. Labels
          // that still collide are left out at that zoom; every cluster is
          // in the legend.
          m.addSource('cluster-labels', { type: 'geojson', data: (propsRef.current.clusterLabels ?? EMPTY) as GeoData });
          m.addLayer({
            id: 'cluster-label',
            type: 'symbol',
            source: 'cluster-labels',
            layout: {
              'text-field': ['coalesce', ['get', 'label'], ['get', 'name']],
              'text-font': FONT,
              'text-size': 12,
              'text-max-width': 7,
              'text-padding': 0,
              'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
              'text-radial-offset': 0.4,
              // Live clusters are placed first; clusters not yet live give way.
              'symbol-sort-key': ['case', ['get', 'live'], 0, 1],
              'text-justify': 'auto',
            },
            paint: { 'text-color': LABEL_TEXT, 'text-halo-color': '#FFFFFF', 'text-halo-width': 2 },
          });

          // Event markers count each cluster's upcoming events. They are not
          // drawn on the cluster map, where the legend gives the counts and
          // the areas and their names come first.
          m.addImage('event-dot', eventDot(), { sdf: true });
          m.addSource('cluster-events', { type: 'geojson', data: (propsRef.current.clusterEvents ?? EMPTY) as GeoData });
          m.addLayer({
            id: 'cluster-event-points',
            type: 'symbol',
            source: 'cluster-events',
            layout: {
              visibility: propsRef.current.clusterMap ? 'none' : 'visible',
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
          m.addSource('money-arcs', { type: 'geojson', data: (propsRef.current.money?.arcs ?? EMPTY) as GeoData });
          m.addLayer({
            id: 'money-arc',
            type: 'line',
            source: 'money-arcs',
            layout: { visibility: moneyOn, 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': ARC_COLOUR, 'line-width': ['get', 'width'], 'line-opacity': 0.75 },
          });
          m.addSource('money-ends', { type: 'geojson', data: (propsRef.current.money?.ends ?? EMPTY) as GeoData });
          m.addLayer({
            id: 'money-end',
            type: 'circle',
            source: 'money-ends',
            layout: { visibility: moneyOn },
            paint: { 'circle-color': ARC_COLOUR, 'circle-radius': 4, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.5 },
          });
          for (const [layer, value] of companyVisibility(three, Boolean(propsRef.current.money))) m.setLayoutProperty(layer, 'visibility', value);
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
            propsRef.current.onDrawing(false);
            if (box[0] < box[2] && box[1] < box[3]) propsRef.current.onArea?.(box);
          });

          const first = (features?: MapGeoJSONFeature[]) => features?.[0]?.properties ?? {};
          const pickCell = (e: { features?: MapGeoJSONFeature[] }) => {
            if (drawingRef.current || isFaded(propsRef.current)) return;
            const cell = first(e.features).cell;
            if (typeof cell === 'string') propsRef.current.onSelectCell(cell);
          };
          m.on('click', 'hex-fill', pickCell);
          m.on('click', 'hex-3d', pickCell);
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
            if (!isFaded(p) && m.queryRenderedFeatures(e.point, { layers: COMPANY_LAYERS.filter((l) => m.getLayer(l)) }).length) return;
            const top = [...(e.features ?? [])].sort((a, b) => Number(b.properties?.rank ?? 0) - Number(a.properties?.rank ?? 0))[0];
            const id = top?.properties?.id;
            if (typeof id === 'string') p.onSelectCluster?.(id);
          });
          for (const layer of [...COMPANY_LAYERS, 'cluster-fill']) {
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
            // The ramp is scaled to the busiest area in view.
            if (Math.max(1, busiest(drawn.current.bins)) !== drawn.current.max) draw();
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
  }, [props.companies, props.fixedResolution, props.selectedCell]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('hex-selected')) map.setFilter('hex-selected', ['==', ['get', 'cell'], props.selectedCell ?? '']);
  }, [props.selectedCell]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (props.drawing) map.dragPan.disable();
    else map.dragPan.enable();
    container.current?.classList.toggle('drawing', props.drawing);
  }, [props.drawing, loaded]);

  // 3D or Flat: the columns or the flat hexagons, and the camera tilted or straight down.
  const lastThree = useRef(props.three);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getLayer('hex-3d')) return;
    for (const [layer, value] of companyVisibility(props.three, Boolean(props.money))) map.setLayoutProperty(layer, 'visibility', value);
    if (props.three) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
    if (lastThree.current === props.three) return;
    lastThree.current = props.three;
    const camera = { pitch: props.three ? PITCH : 0, bearing: props.three ? BEARING : 0 };
    if (reducedMotion()) map.jumpTo(camera);
    else map.easeTo({ ...camera, duration: 700 });
  }, [props.three, loaded]);

  // The Money view: its overlay replaces the company shading while it is open.
  const moneyOpen = Boolean(props.money);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getLayer('money-arc')) return;
    for (const layer of MONEY_LAYERS) map.setLayoutProperty(layer, 'visibility', moneyOpen ? 'visible' : 'none');
    for (const [layer, value] of companyVisibility(propsRef.current.three, moneyOpen)) map.setLayoutProperty(layer, 'visibility', value);
  }, [moneyOpen, loaded]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource('money-regions') as GeoJSONSource | undefined)?.setData((props.money?.regions ?? EMPTY) as GeoData);
    (map.getSource('money-arcs') as GeoJSONSource | undefined)?.setData((props.money?.arcs ?? EMPTY) as GeoData);
    (map.getSource('money-ends') as GeoJSONSource | undefined)?.setData((props.money?.ends ?? EMPTY) as GeoData);
  }, [props.money, loaded]);

  // See overseas: zoom out, flat, to the UK and every country money went to;
  // Back to the UK returns to the usual view. The map is never remounted.
  const overseasKey = props.overseasBounds ? props.overseasBounds.join(',') : '';
  const lastOverseas = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || overseasKey === lastOverseas.current) return;
    const was = lastOverseas.current;
    lastOverseas.current = overseasKey;
    const bounds = propsRef.current.overseasBounds;
    if (bounds) {
      map.setMinZoom(1);
      // The map's own padding keeps the panel clear; this adds a margin round the arcs.
      map.fitBounds(bounds, { padding: 48, pitch: 0, bearing: 0, maxZoom: 5, duration: 1400, animate: !reducedMotion() });
    } else if (was) {
      map.setMinZoom(3);
      frame(false);
    }
  }, [overseasKey, loaded]);

  // The panels over the map change with the layout; keep the camera's centre in the room they leave.
  const paddingKey = `${props.padding.top},${props.padding.right},${props.padding.bottom},${props.padding.left}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const now = map.getPadding();
    const want = props.padding;
    if (now.top !== want.top || now.right !== want.right || now.bottom !== want.bottom || now.left !== want.left) map.setPadding(want);
  }, [paddingKey, loaded]);

  // The List view covers the map; when it comes back its box may have changed.
  useEffect(() => {
    if (!props.hidden) mapRef.current?.resize();
  }, [props.hidden]);

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
    map.setLayoutProperty('cluster-event-points', 'visibility', props.clusterMap ? 'none' : 'visible');
  }, [props.clusterMap, faded, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource('cluster-events') as GeoJSONSource | undefined;
    if (loaded && source) source.setData((props.clusterEvents ?? EMPTY) as GeoData);
  }, [props.clusterEvents, loaded]);

  // Draw the distance ring.
  const ringKey = props.ring ? `${props.chosenSite}:${props.ring[0].join(',')}:${props.ring.length}:${props.ring[24]?.join(',')}` : '';
  useEffect(() => {
    const source = mapRef.current?.getSource('site-ring') as GeoJSONSource | undefined;
    if (loaded && source) source.setData(ringGeoJSON(props.ring));
  }, [ringKey, loaded]);

  // Move the camera when what it should frame changes: a place and its ring,
  // a chosen cluster, or back to the UK. The view a link opens with is kept:
  // the first focus only moves the camera when the link gave no position.
  const focusKey = props.focus?.key ?? null;
  const lastFocusKey = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || focusKey === null || lastFocusKey.current === focusKey) return;
    const first = lastFocusKey.current === null;
    lastFocusKey.current = focusKey;
    if (first) {
      if (!propsRef.current.initialPosition && focusKey !== 'uk') frame(true);
    } else frame(false);
  }, [focusKey, loaded]);

  if (props.api) {
    props.api.current = {
      viewArea: () => {
        const map = mapRef.current;
        const el = container.current;
        if (!map || !el) return null;
        // The two near corners of the room the panels leave, and the same
        // two mirrored through the centre: in a tilted view this is the
        // ground around the centre, not everything out to the horizon.
        const { padding } = propsRef.current;
        const centre = map.getCenter();
        const y = el.clientHeight - padding.bottom;
        const near = [map.unproject([padding.left, y]), map.unproject([el.clientWidth - padding.right, y])];
        const points = near.flatMap((p) => [
          [p.lng, p.lat],
          [2 * centre.lng - p.lng, 2 * centre.lat - p.lat],
        ]);
        const clampLat = (n: number) => Math.max(-85, Math.min(85, n));
        const clampLon = (n: number) => Math.max(-180, Math.min(180, n));
        const lons = points.map((p) => clampLon(p[0]));
        const lats = points.map((p) => clampLat(p[1]));
        const box: Bbox = [round5(Math.min(...lons)), round5(Math.min(...lats)), round5(Math.max(...lons)), round5(Math.max(...lats))];
        return box[0] < box[2] && box[1] < box[3] ? box : null;
      },
    };
  }

  const overlap = props.fixedResolution != null;
  return (
    <div class="map-wrap" inert={props.hidden}>
      <div id="tally-map" class="map" ref={container} role="region" aria-label={props.money ? (props.money.measure === 'spend' ? 'Map of MOD spend with UK industry by region' : 'Map of defence contract money by region') : 'Map of the companies that match the filters'}>
        {failed && <p class="map-failed">The map cannot be shown in this browser. Every company is in the list.</p>}
      </div>
      {props.money ? (
        <div class="map-legend">
          <h2 id="legend-heading" class="mono">
            {props.money.measure === 'spend' ? `MOD spend with UK industry by region, ${props.money.year}` : `Contract value by region, ${props.money.year}`}
          </h2>
          <div class="ramp" aria-hidden="true">
            <div class="r1">Least</div>
            <div class="r2" />
            <div class="r3" />
            <div class="r4">Most</div>
          </div>
          {props.money.measure === 'spend' ? (
            <p class="legend-note">Official statistics from the Ministry of Defence. Every figure is in the table.</p>
          ) : (
            <p class="legend-note">
              <span class="legend-arc" aria-hidden="true" />
              Regions with no contract money are left unshaded. Lines run to the countries of overseas suppliers, thicker for more money. Every figure is in the tables.
            </p>
          )}
        </div>
      ) : (
        <div class="map-legend">
          <h2 id="legend-heading" class="mono">
            {overlap ? 'Companies in places where all chosen capabilities overlap' : 'Companies per hexagon'}
          </h2>
          {legend === 'loading' && !failed ? (
            <p>Loading the map.</p>
          ) : legend === 'empty' ? (
            <p>No companies with a location match.</p>
          ) : (
            <div class="ramp" aria-hidden="true">
              <div class="r1">Fewest</div>
              <div class="r2" />
              <div class="r3" />
              <div class="r4">Most</div>
            </div>
          )}
          {legend === 'shown' && <p class="legend-note">{pins ? 'Each pin is a company; numbered circles group those close together.' : `Select ${props.three ? 'a column' : 'a hexagon'} to list its companies.`}</p>}
        </div>
      )}
    </div>
  );
}
