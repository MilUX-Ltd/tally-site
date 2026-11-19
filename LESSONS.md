# Lessons

Read at the start of every session. Add a dated entry when something surprised you or cost time. Curated monthly: recurring lessons graduate into `CLAUDE.md` or an ADR.

## 2026-11-19

- Repository created public. Anything written here is published; check the "What never goes in this repo" list in `CLAUDE.md` before every commit.

- A lockfile made with `npm install` on macOS can leave out optional packages that Linux needs (WebAssembly runtimes), and `npm ci` then fails in CI. If CI reports "Missing: ... from lock file", delete `node_modules` and `package-lock.json`, run a clean `npm install`, and commit the new lockfile.
- A first deploy of a new Worker can return 404 for a few seconds while it propagates. The deploy check retries a 404 for up to a minute before failing.
