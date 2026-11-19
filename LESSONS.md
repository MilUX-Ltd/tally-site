# Lessons

Read at the start of every session. Add a dated entry when something surprised you or cost time. Curated monthly: recurring lessons graduate into `CLAUDE.md` or an ADR.

## 2026-11-19

- Repository created public. Anything written here is published; check the "What never goes in this repo" list in `CLAUDE.md` before every commit.

- A lockfile made with `npm install` on macOS can leave out optional packages that Linux needs (WebAssembly runtimes), and `npm ci` then fails in CI. If CI reports "Missing: ... from lock file", delete `node_modules` and `package-lock.json`, run a clean `npm install`, and commit the new lockfile.
- A first deploy of a new Worker can return 404 for a few seconds while it propagates. The deploy check retries a 404 for up to a minute before failing.
- Astro's island directives (`client:load` and friends) add an inline loader script and an inline style, which a CSP without `unsafe-inline` blocks, so the island never hydrates. The explorer is mounted from a bundled `<script>` module instead. The dev and preview servers now send the production headers, so journey tests catch this.
- `astro preview` moves itself to the background when it detects a coding agent, and Playwright then reports that the web server exited early. The test server runs with `--ignore-lock` to stay in the foreground.
- MapLibre resolves its worker relative to its own file, which breaks once bundled. Import the worker with `?url` and pass it to `setWorkerUrl`.
- Another checkout of this repo (or another agent) may already be serving on the Playwright port, and with `reuseExistingServer` locally the tests then run against the wrong build (a 404 for a new page, or timeouts from contention). Check `lsof -iTCP:4331` first, or run with a copy of the config on another port.
- Journey tests click the map at fixed coordinates inside the map's box, which must be on screen at the default viewport. Adding a line to the explorer's header pushed Bristol below the fold and two map-click tests failed. Keep the explorer header short, or scroll the map into view in new tests.
