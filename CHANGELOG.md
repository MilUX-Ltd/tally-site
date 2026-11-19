# Changelog

All notable changes to the Tally site. Versions follow semantic versioning.

## [Unreleased]

### Added
- Walking skeleton: holding page, 404 page, security headers baseline, public-terms guard, CI with lint, type check, unit tests and the accessibility floor, preview and production deploy jobs.
- Capability heatmap: a full-width UK map (MapLibre, OpenFreeMap tiles) with companies binned into H3 hexagons in the browser, coloured by count with a brand legend, turning into clustered pins when zoomed in. Selecting a hexagon, cluster or pin lists its companies.
- Filters for capability (by group), size, region, framework, accreditation and membership, redrawing the map and the paged results list.
- Build step that fetches the public data and taxonomy and slims them for the browser; a synthetic test fixture so tests never use the network.
- Every view in the URL: filters, map centre and zoom, the selected hexagon or companies, the area, the matrix view and the results page are written to the query string and restored on load. Parameters are documented in `CONTEXT.md`.
- Capability matrix linked both ways with the map: companies against top-level capabilities in the ten groups, a page of rows at a time; ticking a column sets the capability filter and redraws the map; taking the map's current view or drawing a rectangle narrows the matrix. Fully keyboard operable.
- Shortlist: add or remove companies from the list or a map area; the shortlist is held in the URL (`list`), with a link to share, CSV download (columns in `CONTEXT.md`, formula-safe), a secondary "Book a call" link and the built-with-AI line.
- Capability overlap: with two or more capabilities chosen, a toggle switches from any of them to only the places where all of them are found (`capmatch=all`); the map, count, matrix and list follow.
- Overlap mode reads more clearly: the count says how many companies have a chosen capability and in how many places all overlap, never announces zero while loading, `capmatch` is left out of the URL with fewer than two capabilities, and a shortlist downloaded in overlap mode is named `tally-shortlist-overlap.csv`.
- Overseas companies listed by country, Europe first then the rest of the world, following the same filters; an explicit guard in the build and the browser keeps overseas and out-of-bounds points off the UK map.
- Bundle-size check in the build, and journey tests run under the production CSP.

### Changed
- CSP allows the map tile host (`tiles.openfreemap.org`) for connect and images only.
