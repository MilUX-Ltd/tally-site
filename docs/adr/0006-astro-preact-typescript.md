# 0006: Astro with one Preact island, TypeScript, Vitest and Playwright

Status: accepted, November 2026

## Context
The site is one interactive explorer (map, matrix, filters, shortlist) plus a few static pages. It must meet WCAG 2.2 AA, work at phone width, and be testable in CI.

## Options
1. Astro with the explorer as one Preact island.
2. A single-page app.
3. No framework.

## Decision
Option 1. State lives in one store serialised to and from the URL, so every view can be shared. Filter, binning and URL logic are framework-free TypeScript.

## Consequences
Static pages stay fast. The matrix and the list are the accessible route to everything the map shows. Targets: no more than 300 KB of JavaScript before map tiles; Lighthouse accessibility 100.

## Revisit when
The explorer grows past 500 KB, or a second interactive surface needs shared state.
