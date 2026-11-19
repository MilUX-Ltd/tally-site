# Tally: domain language and public interface

## Glossary

- **Company**: an organisation listed in Tally, from public sources only.
- **Capability**: something a company can do, from the grouped taxonomy (for example Counter-UAS under Air).
- **Group**: a heading that gathers capabilities (Core capabilities, Engineering, Manufacturing, Uncrewed systems, Professional services, Space).
- **Cluster**: a UK regional defence and security cluster. Companies may be members (`mbr-<cluster>`).
- **Event**: a dated cluster event. Public events are shown in full; members-only events appear only as a signpost to join the cluster.
- **Shortlist**: companies a buyer has picked, held in the URL, exportable as CSV.
- **Heatmap**: hexagon density of companies matching the current filters.
- **Overlap**: places where two or more chosen capabilities coincide.

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

   Filters combine: a company must match every facet that has values. Only one of `cell`, `sel` and `area` is set at a time; the area list shows the companies that match the filters within it.
2. **Data contract.** The build (`scripts/fetch-data.mjs`) reads `tally-data.json` and `taxonomy.json` from `MilUX-Ltd/tally` and writes a slimmed `public/data/tally.json` (not committed). Fields the site depends on:
   - Company: `name`, `website`, `linkedin`, `hq`, `region`, `size`, `headcount`, `founded`, `tags`, `summary`, and when present `lat`, `lon`, `postcode`, `location_source` (`website`, `companies-house` or `town`) and `country` (overseas companies). `body` is dropped. A company without a valid `lat` and `lon` is listed but not mapped. Links that are not http or https are dropped.
   - Each company gets an `id`: its name in lower case with runs of other characters turned into hyphens (a numeric suffix if two names collide). Ids appear in URLs, so they are part of this interface.
   - Taxonomy: `facets.capability.groups` (`slug`, `label`, `order`, `description`), `facets.capability.values` (`slug`, `label`, `group`), and the `size`, `region`, `frameworks`, `accreditations` and `memberships` facets.
   - Filter meaning: within a facet any value matches; facets combine; a capability matches its sub-capabilities (`cyber` matches `cyber/pen-testing`).
3. **CSV export.** Column order and headings, documented here when the shortlist lands.
4. **Routes.** `/` (explorer), `/about`, `/countries`, `/events`, `/404`.
