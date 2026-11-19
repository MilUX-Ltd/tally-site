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
- Growth over time: a slider (with play) replays the directory's size by month, overall and per capability group, from a small file built at build time from the data repo's git history; the month is held in the URL (`month`).
- Defence sites overlay: 53 widely published UK defence sites, each verified against its Wikipedia article (CC BY-SA 4.0, attributed), can be drawn on the map; choosing a site and a radius (10, 25 or 50 miles) draws a ring and narrows the map, matrix and list to companies within it. Held in the URL (`site`, `radius`, `sites`).
- Cluster regions overlay: the areas of the 16 UK regional defence and security clusters, merged and simplified from ONS Open Geography boundaries (Open Government Licence v3.0, attributed), drawn in each cluster's colour with a marker counting its upcoming events. Choosing a cluster narrows the companies to its recorded members (`mbr-` tag) and lists its upcoming events. Held in the URL (`clusters`, `cluster`).
- `/events`: upcoming cluster events as a month calendar and a list, built at build time; past events are dropped. Members-only events show only a signpost and a link to join the cluster, and the build refuses a members-only event that carries anything more.
- Bundle-size check in the build, and journey tests run under the production CSP.
- Plain-English search: a search box sends the request to `POST /api/search`, a Worker route on the same site that asks Claude Haiku for filter values through one strict tool, validates them against the filter schema and the known values, and returns filters only. The route is rate-limited and budget-capped; without a key, at a limit, or on any failure it answers `{"fallback": true}` and the browser runs a keyword search over names, summaries and tag labels, held in the URL (`q`), and says so. Contract in `CONTEXT.md`.
- A page for each company at `/companies/<id>/`, built statically: summary, what they do, products, capabilities grouped by capability group, size, region, location with a small static map (a shared UK outline from the committed ONS boundaries and a marker; none for region-level, overseas or unplaced companies), frameworks, accreditations, memberships, website and LinkedIn links, the date the public sources were verified, Add to shortlist (keeping the shortlist the visitor came with) and links back to the explorer and the map. Company text is safe Markdown: paragraphs, lists, emphasis and http(s) links only. Company names in the results, map area, overseas lists and matrix link to their pages.
- `/sitemap.xml` and a `Sitemap` line in `robots.txt`; every page has a canonical URL on tally.milux.co.uk, and company pages have their own titles and descriptions.
- "Correct this listing" on every company page and a site-wide "Get listed" link (footer and explorer header): plain mail links to contact@milux.co.uk with a pre-filled subject and prompt. No form, nothing stored, no third party.
- `/about`: what Tally is, public sources only, licences and credits, built with AI, and how to get listed or correct a listing. Every page shares one footer linking to it.

### Changed
- Pull-request previews use Worker Previews (`wrangler preview`), since a Worker that implements a Durable Object gets no version preview URL; the deploy check also exercises the search route.
- CSP allows the map tile host (`tiles.openfreemap.org`) for connect and images only.
