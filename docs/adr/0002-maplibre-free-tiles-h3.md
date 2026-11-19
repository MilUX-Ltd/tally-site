# 0002: MapLibre, free vector tiles, hexagons computed in the browser

Status: accepted, November 2026

## Context
The opening view is a heatmap of UK defence capability that redraws as filters change, turning into pins when zoomed in. About two thousand companies: small enough to compute in the browser. Map tiles are usually the hidden cost.

## Options
1. MapLibre GL JS with OpenFreeMap tiles, hexagons by H3. Open source, no key, no per-view charge.
2. Leaflet with raster tiles and a blurred heatmap. Simpler, but dated at full width, and counted hexagons read more clearly than blur.
3. A commercial map platform. Polished, but metered and keyed.

## Decision
Option 1. Companies are binned into H3 cells in the browser; cell counts set the colour. Overlays are GeoJSON made at build time.

## Consequences
No map cost. The tile source is one style URL, so it can switch to self-hosted tiles without code changes. Target: a filter change redraws the map within 200 ms.

## Revisit when
The tile service becomes unreliable or changes its terms, or the directory passes ten thousand companies.
