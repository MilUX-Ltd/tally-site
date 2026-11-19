# Tally: domain language and public interface

## Glossary

- **Company**: an organisation listed in Tally, from public sources only.
- **Capability**: something a company can do, from the grouped taxonomy (for example Counter-UAS under Air).
- **Group**: a heading that gathers capabilities (Core capabilities, Engineering, Manufacturing, Uncrewed systems, Professional services, Space).
- **Cluster**: a UK regional defence and security cluster. Companies may be members (`mbr-<cluster>`).
- **Event**: a dated cluster event. Public events are shown in full; members-only events appear only as a signpost to join the cluster.
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
   | `capmatch` | How two or more `cap` values combine: `all` shows only overlap places (see Overlap); ignored and left out with fewer than two capabilities | `all` | any of them |

   Filters combine: a company must match every facet that has values. Only one of `cell`, `sel` and `area` is set at a time; the area list shows the companies that match the filters within it.
2. **Data contract.** The build (`scripts/fetch-data.mjs`) reads `tally-data.json` and `taxonomy.json` from `MilUX-Ltd/tally` and writes a slimmed `public/data/tally.json` (not committed). Fields the site depends on:
   - Company: `name`, `website`, `linkedin`, `hq`, `region`, `size`, `headcount`, `founded`, `tags`, `summary`, and when present `lat`, `lon`, `postcode`, `location_source` (`website`, `companies-house`, `town` or `region`) and `country` (overseas companies). `body` is dropped. A company without a valid `lat` and `lon` is listed, filtered and in the matrix but not mapped. A company whose `location_source` is `region` is never mapped, even if coordinates appear: its UK location is not published. Links that are not http or https are dropped.
   - Each company gets an `id`: its name in lower case with runs of other characters turned into hyphens (a numeric suffix if two names collide). Ids appear in URLs, so they are part of this interface.
   - Taxonomy: `facets.capability.groups` (`slug`, `label`, `order`, `description`), `facets.capability.values` (`slug`, `label`, `group`), and the `size`, `region`, `frameworks`, `accreditations` and `memberships` facets.
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
4. **Routes.** `/` (explorer), `/about`, `/countries`, `/events`, `/404`.
