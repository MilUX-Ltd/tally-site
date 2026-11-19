# Architecture decisions

How the Tally site is built, and why. Written for anyone learning the approach. Each record states the choice, the alternatives, and what would make us revisit it.

| ADR | Decision |
|---|---|
| [0001](0001-static-site-on-cloudflare.md) | A static site on Cloudflare, with one small server route for search |
| [0002](0002-maplibre-free-tiles-h3.md) | MapLibre, free vector tiles, hexagons computed in the browser |
| [0003](0003-data-built-from-the-data-repo.md) | Company data stays in its own repository and is built into the site |
| [0004](0004-plain-english-search.md) | Plain-English search returns filters, never text |
| [0005](0005-weekly-refresh.md) | A weekly refresh proposes data changes as one pull request |
| [0006](0006-astro-preact-typescript.md) | Astro with one Preact island, TypeScript, Vitest and Playwright |
