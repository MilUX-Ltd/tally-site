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

1. **URL state.** Every view is reproducible from its URL query string. The parameter set is defined in `src/lib/url-state.ts` (arrives with the explorer) and documented here when it lands.
2. **Data contract.** The build reads `tally-data.json` from `MilUX-Ltd/tally`. The fields the site depends on are listed here when the schema is extended (postcode, coordinates, groups, clusters).
3. **CSV export.** Column order and headings, documented here when the shortlist lands.
4. **Routes.** `/` (explorer), `/about`, `/countries`, `/events`, `/404`.
