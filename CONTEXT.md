# Tally: domain language and public interface

## Glossary

- **Company**: an organisation listed in Tally, from public sources only.
- **Capability**: something a company can do, from the grouped taxonomy (for example Counter-UAS under Air).
- **Group**: a heading that gathers capabilities (Core capabilities, Engineering, Manufacturing, Uncrewed systems, Professional services, Space).
- **Cluster**: a UK regional defence and security cluster. Companies may be members (`mbr-<cluster>`).
- **Event**: a dated cluster event. Public events are shown in full; members-only events appear only as a signpost: the cluster, the date, the text "Members' event: join the cluster for details" and a "Join the cluster" link to the cluster's own website.
- **Opportunity**: an open funding call (`funding`) or other opportunity (`opportunity`) shared by a cluster, with a deadline or, when its source says so, no closing date. Only public items with a public link are listed; members-only items are never published.
- **Cluster area**: the part of the UK a cluster covers, as ONS areas (counties and unitary authorities, English regions or countries) merged into one outline. Areas are approximate and can overlap.
- **Shortlist**: companies a buyer has picked, held in the URL, exportable as CSV.
- **Heatmap**: hexagon density of companies matching the current filters.
- **Matrix**: a table of companies against top-level capabilities, grouped by capability group. A company is ticked under a capability when it has it or a sub-capability.
- **Area**: a rectangle taken from the map's current view or drawn on the map; it narrows the area list and the matrix.
- **Overlap**: places where two or more chosen capabilities coincide. A place is an H3 hexagon at resolution 5 (about 250 square kilometres), fixed so the answer does not change with zoom. A place is an overlap when each chosen capability is found there, in one company or several; overlap mode shows the companies in those places that have at least one chosen capability.

## Public interface (what consumers depend on)

Versioned with the site. A change to any of these is at least a minor bump; a breaking change is a major bump.

1. **URL state.** Every view is reproducible from its URL query string, defined in `src/lib/url-state.ts`. A parameter at its default is left out, so the plain address is the default view. Lists are comma-separated. Unknown parameters are ignored; malformed values, and values the data does not know, are dropped. The page updates the address as the view changes, without reloading or adding history entries.

   | Parameter | Meaning | Format | Default |
   |---|---|---|---|
   | `cap` | Capabilities (any; each also matches its sub-capabilities) | capability slugs, for example `cyber,uas/fixed-wing` | none |
   | `size` | Company sizes (any) | size slugs, for example `size-small` | none |
   | `region` | UK regions (any) | region names, for example `South West` | none |
   | `fw` | Frameworks (any) | framework slugs, for example `fw-dos` | none |
   | `accr` | Accreditations (any) | accreditation slugs, for example `accr-ce-plus` | none |
   | `mbr` | Memberships (any) | membership slugs, for example `mbr-ads` | none |
   | `map` | Map zoom and centre | `zoom/lat/lon`, for example `7.25/51.5/-2.548` | the whole UK |
   | `cell` | Selected hexagon | H3 index (15 hexadecimal characters) | none |
   | `sel` | Selected companies (a cluster or pin) | company ids | none |
   | `area` | Area taken from the map | `west,south,east,north` in degrees | none |
   | `mgroup` | Capability group whose columns the matrix shows | group slug | all groups |
   | `mpage` | Page of matrix rows | whole number from 1 | 1 |
   | `page` | Page of the results list | whole number from 1 | 1 |
   | `list` | Shortlisted companies, in the order added | company ids | none |
   | `month` | Month shown by the growth slider; dropped if the history does not hold it | `YYYY-MM` | the latest month |
   | `capmatch` | How two or more `cap` values combine: `all` shows only overlap places (see Overlap); ignored and left out with fewer than two capabilities | `all` | any of them |
   | `site` | Chosen defence site; companies are narrowed to those within the radius | site id from the dataset | none |
   | `radius` | Radius around the chosen site, in miles | `10`, `25` or `50` | `25` |
   | `near` | Place from near-me search, as resolved by the place lookup (a formatted postcode, an outward code or a place name); needs `at`; dropped when `site` is set | letters, digits, spaces, apostrophes, hyphens, full stops and commas, 2 to 60 characters | none |
   | `at` | Point of the `near` place; companies are narrowed to those within `within` miles | `lat,lon` to 4 decimal places, inside the UK bounds | none |
   | `within` | Radius around the `near` place, in miles; left out without a place | `5`, `10`, `25` or `50` | `25` |
   | `sites` | Draw every defence site on the map | `1` | not drawn |
   | `clusters` | Draw every cluster's area and a marker counting its upcoming events | `1` | not drawn |
   | `cluster` | Chosen cluster; its area is drawn, and companies narrow to its recorded members when Tally records them (`mbr-` tag), otherwise they are not narrowed | cluster id from `clusters.json`, for example `SCRDSC` | none |
   | `q` | Keyword search, set when plain-English search falls back: companies whose name, summary or tag labels contain every word (common words ignored; a word matches the start of a word) | text, up to 300 characters | none |

   Filters combine (a chosen cluster, and a chosen site or place, narrow the companies too). Only one location filter is set at a time: choosing a place clears the site and choosing a site clears the place: a company must match every facet that has values. Only one of `cell`, `sel` and `area` is set at a time; the area list shows the companies that match the filters within it.
2. **Data contract.** The build (`scripts/fetch-data.mjs`) reads `tally-data.json` and `taxonomy.json` from `MilUX-Ltd/tally` and writes a slimmed `public/data/tally.json` (not committed). Fields the site depends on:
   - Company: `name`, `website`, `linkedin`, `hq`, `region`, `size`, `headcount`, `founded`, `tags`, `summary`, and when present `lat`, `lon`, `postcode`, `location_source` (`website`, `companies-house`, `town` or `region`) and `country` (overseas companies). `body` is dropped. A company without a valid `lat` and `lon` is listed, filtered and in the matrix but not mapped. A company whose `location_source` is `region` is never mapped, even if coordinates appear: its UK location is not published. An overseas company (`country` set, or region `Overseas`) is never mapped, and nor is any point outside the UK bounds: the build drops such points and the browser's `isLocated` refuses them. Links that are not http or https are dropped.
   - Each company gets an `id`: its name in lower case with runs of other characters turned into hyphens (a numeric suffix if two names collide). Ids appear in URLs, so they are part of this interface.
   - Taxonomy: `facets.capability.groups` (`slug`, `label`, `order`, `description`), `facets.capability.values` (`slug`, `label`, `group`), and the `size`, `region`, `frameworks`, `accreditations` and `memberships` facets.
   - History: `scripts/build-history.mjs` clones `MilUX-Ltd/tally` with full history and writes `public/data/history.json` (not committed): `{ generated, groups: [{ slug, label }], months: [{ month, carried, total, groups: { <group slug>: count } }] }`. One snapshot per month, the last commit touching `tally-data.json` in that month (UTC); a month with no commit repeats the month before and has `carried: true`. Group counts read older tags through today's taxonomy. The history starts in June 2026.
   - Defence sites: `public/sites/defence-sites.json` is committed (it is not company data). Each site has `id`, `name`, `kind` (`air-station`, `base`, `hq`, `naval-base`, `range`, `training-area`), `lat`, `lon`, a `source` (article title, URL, revision, licence, retrieval date) and a `verification` (status and distance in km). Coordinates come from the primary coordinates of the Wikipedia article about each site (CC BY-SA 4.0); a site is included only when the candidate point was within 3 km of the source point. `scripts/verify-sites.mjs` re-checks them by hand. Distances to companies are great-circle miles; overseas and unplaced companies never count.
   - Places (near-me search): looked up in the browser with postcodes.io (`/postcodes/<postcode>`, `/outcodes/<code>`, `/places?q=<name>`), only when the buyer presses Find, sending only the typed place, without cookies or referrer. Typed text that is not a postcode, outward code or place name is refused before any request. Same-named places: exact matches first, then a city, town, village and smaller places. Only the name and a point inside the UK bounds are used from the answer. Region-level and overseas companies are never inside a radius.
   - Clusters: the build reads `clusters.json` from the data repo and writes `public/data/clusters.json` (not committed): `{ as_of, clusters: [{ id, name, full, region, regions: [{ code, name }], status, web, linkedin, colour, membership }] }`. `status` is `live`, `pre-launch` or `proposed`; `web` and `linkedin` are https links or null; `colour` is a hex colour; `membership` is the `mbr-` tag of the cluster's members in Tally, or null when Tally records none; `regions` are ONS Open Geography codes (December 2025).
   - Events: the build reads `events.json` from the data repo and writes `public/data/events.json` (not committed): `{ as_of, events }`, sorted by date, with past events (before the build's UTC date) dropped. A public event is exactly `{ audience: "public", cluster, date, time, where, title, summary, link }` (`time`, `where`, `summary` and `link` may be null; unsafe links are dropped). A members-only event is exactly `{ audience: "members", cluster, date, text, link }`, where `text` is the fixed signpost and `link` is the cluster's own website. The build fails if a members-only event carries any other field, other text or another link, if an event names an unknown cluster, or if a public event carries fields outside its contract.
   - Opportunities: the build reads `opportunities.json` from the data repo and writes `public/data/opportunities.json` (not committed): `{ as_of, opportunities }`, sorted by deadline (items with no closing date last), with items whose deadline is before the build's UTC date dropped. Each item is exactly `{ kind, cluster, deadline, time, title, summary, link }`: `kind` is `funding` or `opportunity`; `deadline` is `YYYY-MM-DD` or null (no closing date); `time` and `summary` may be null; `link` is an http or https link, and an item without one is dropped. The build fails if an item carries any other field, an unknown kind or cluster, no title or a malformed deadline. Members-only items are never part of this file.
   - Cluster areas: `public/clusters/cluster-regions.geojson` is committed (it is not company data), built by hand with `scripts/build-cluster-regions.mjs` from the ONS Counties and Unitary Authorities, Regions and Countries (December 2025) ultra generalised boundaries: each cluster's areas are merged by removing shared borders, simplified and rounded. One feature per cluster with `id`, `name`, `colour` and a marker point (`lon`, `lat`); the file carries `source`, `licence` (Open Government Licence v3.0) and `attribution`, which the site shows. It is fetched only when the overlay is on or a cluster is chosen.
   - Filter meaning: within a facet any value matches; facets combine; a capability matches its sub-capabilities (`cyber` matches `cyber/pen-testing`).
3. **CSV export.** "Download CSV" saves `tally-shortlist.csv`: UTF-8 with a byte order mark, comma-separated, CRLF line ends, values quoted when they hold a comma, quote or line break (RFC 4180). One header row, then one row per shortlisted company in shortlist order. A value starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading apostrophe so spreadsheet software cannot run it as a formula. Columns, in order:

   | Column | Content |
   |---|---|
   | Name | Company name |
   | Website | Company website (http or https only) |
   | LinkedIn | Company LinkedIn page |
   | Headquarters | Town and country as published |
   | Region | UK region, or Overseas |
   | Country | Country, for overseas companies |
   | Postcode | Postcode, when published |
   | Location source | Where the location came from: `website`, `companies-house`, `town` or `region` (UK location not published) |
   | Size | Micro, Small, Medium or Large |
   | Capabilities | Capability labels, separated by "; " |
   | Accreditations | Accreditation labels, separated by "; " |
   | Frameworks | Framework labels, separated by "; " |
   | Memberships | Membership labels, separated by "; " |
   | Summary | One-paragraph summary |

   Downloaded in overlap mode, the file is named `tally-shortlist-overlap.csv`; its content is the same.
4. **Routes.** `/` (explorer), `/about`, `/ask-tally` (how to connect an AI assistant to the Ask Tally connector; static, no script), `/events` (upcoming cluster events: a month calendar for each month with events, each event day linking to `#d-YYYY-MM-DD` in the list below; static, no script), `/opportunities` (open funding calls and opportunities, soonest deadline first; one bundled module adds a filter held in the URL as `cluster` (a cluster id with listed items) and `kind` (`funding` or `opportunity`), unknown values ignored; without the module the full list shows), `/404`. The explorer header links to `/events` and `/opportunities`. Overseas companies are a section of the explorer (Europe, then the rest of the world), not a separate page.
5. **Search API.** `POST /api/search` on the same origin (docs/adr/0004).
   - Request: `Content-Type: application/json` (anything else is `415 {"error": "unsupported-media-type"}`), body `{"q": "<request>"}`; `q` is a string of 1 to 300 characters once trimmed. A body over a small size cap is `413 {"error": "too-large"}` and is not read further.
   - `200 {"fallback": false, "filters": {"cap": [], "size": [], "region": [], "fw": [], "accr": [], "mbr": []}, "capmatch": "any" | "all", "site": "<site id>" | null, "radius": 10 | 25 | 50}`: filter values for the explorer, in the URL-state vocabulary above. Every value is one the data knows; a capability group named in the request arrives as its top-level capabilities; `capmatch` is `all` only with two or more capabilities.
   - `200 {"fallback": true}`: use the keyword search instead. Returned when search is not configured, a rate or budget limit is reached, the model is unavailable, or its answer is unusable.
   - `400 {"error": "bad-request"}` for a body that is not JSON `{"q": string}` or an empty `q`; `413 {"error": "too-long", "max": 300}` for a longer `q`; `405` for any method but POST; `404` for any other `/api/` path.
   - Responses are JSON with `Cache-Control: no-store`. Nothing the model writes is returned, and the request text is not logged or kept. The browser checks every value again against its own data before applying it, and treats any failure as a fallback.
6. **Ask Tally connector (MCP).** `POST /mcp` on the same origin, at `https://tally.milux.co.uk/mcp`: a read-only remote Model Context Protocol server over Streamable HTTP, stateless, with no authentication. It serves the 2026-07-28 protocol revision and 2025-era clients (`initialize`), and answers in JSON. It reads only the built assets `/data/tally.json`, `/data/clusters.json` and `/data/events.json`, runs no model and makes no outbound request.
   - HTTP: `POST` only (`405` otherwise; no server-side sessions, so `GET` and `DELETE` are `405`); a request whose `Origin` header is present and is neither this origin nor `https://tally.milux.co.uk` is `403`; `Content-Type: application/json` only (`415`); a body over a small size cap is `413` and is not read further; a visitor over the rate limit gets `429` with `Retry-After` and nothing else runs; a body that is not JSON is `400` (JSON-RPC `-32700`); a batch (any JSON array), a body that is not one JSON-RPC object, or an `id` that is not a whole number or a short plain string (letters, digits, `.`, `_`, `:`, `-`) is `400` (`-32600`). These errors are JSON-RPC error objects with `id: null`. Responses carry `Cache-Control: no-store`.
   - Rate limit: per minute, keyed on the client address plus the `Mcp-Session-Id` header when it holds a session id this server issued (a UUID), otherwise on the address alone, under a higher ceiling for the whole address. A 2025-era `initialize` reply carries a fresh `Mcp-Session-Id`; it is used only as that key, and nothing is kept for it.
   - JSON-RPC error messages are fixed sentences for their code, with no `data`; a `tools/call` naming a tool this server does not offer is a `-32602` error with a fixed message. `initialize` advertises `tools.listChanged: false`.
   - Tools, all annotated read-only, idempotent and closed-world. Every input schema is an object that allows no other keys; strings and lists are bounded. Arguments that fail the schema, and values the data does not know, give a tool result with `isError: true` and `{"error": "<fixed sentence>"}` that never repeats the input.

     | Tool | Input | Result |
     |---|---|---|
     | `search_companies` | all optional: `capabilities`, `groups`, `sizes`, `accreditations`, `frameworks`, `memberships` (lists of 1 to 20 slugs from `list_capabilities`), `regions` (region names), `cluster` (cluster id), `keyword` (1 to 200 characters; the `q` rule above), `near` (`{postcode}` or `{lat, lon}`, with `radius_miles` 1 to 200, default 25), `limit` (1 to 25, default 10) | `{ total, returned, results: [{ id, name, summary, capabilities: [label], location: { hq, region, country, postcode, lat, lon }, page_url, distance_miles? }], near?: { lat, lon, radius_miles, from }, cluster_members_recorded?, explorer_url }` |
     | `get_company` | `id` (company id) or `name` (exact, ignoring case) | `{ company: { id, name, summary, website, linkedin, location: { hq, region, country, postcode, lat, lon, source }, size, headcount, founded, capabilities, accreditations, frameworks, memberships: [{ slug, label }], page_url } }` |
     | `list_capabilities` | none | `{ groups: [{ slug, label, description, capabilities: [{ slug, label }] }], sizes, accreditations, frameworks, memberships: [{ slug, label }], regions: [name] }` |
     | `list_clusters_and_events` | optional `cluster` (cluster id) | `{ clusters: [{ id, name, full, region, status, web, linkedin, members_recorded }], events }`, events as in the data contract above (public in full; members-only as the signpost only), upcoming only |

   - Filter meaning is the site's: within a facet any value matches, facets combine, a capability matches its sub-capabilities, a group stands for its top-level capabilities, and a cluster narrows to its recorded members when Tally records them. `near` keeps only companies the map places (never overseas, unplaced or `location_source: region` companies), nearest first; a postcode is placed only from Tally's own data (a published postcode, or the centre of the mapped companies in its district), otherwise it is an error. `lat` and `lon` are null wherever the site does not map a company. `page_url` is the explorer with the company selected (`/?sel=<id>`); `explorer_url` holds the filters, cluster and keyword in the URL-state vocabulary.
   - Results are JSON data (structured content, and the same JSON as text). Company text is public data from the directory, never instructions from Tally.
