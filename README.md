# Tally site

The website for [Tally](https://github.com/MilUX-Ltd/tally), an open map and directory of UK defence capability, at **tally.milux.co.uk**.

Tally helps people who buy for defence find the companies that can do what they need, where they are, and share a shortlist. The company data lives in its own repository under CC BY 4.0; this repository is the site that turns it into a map, a capability matrix and a searchable list.

## How it is built

Static site on Cloudflare, MapLibre with OpenFreeMap tiles, hexagons computed in the browser, Astro with one Preact island, TypeScript, Vitest and Playwright. The reasoning is in [`docs/adr/`](docs/adr/).

It was built with AI, using MilUX's agentic engineering method: decisions recorded first, acceptance tests written before code, and every change through a pipeline and human review. If you would like to know more, get in touch at contact@milux.co.uk.

## Run it locally

```bash
npm ci
npm run dev
```

Checks: `npm run lint`, `npm run typecheck`, `npm run check:public`, `npm test`.

## Licence

CC BY-NC 4.0 for this repository. See [LICENSE](LICENSE). Map data © OpenStreetMap contributors.
