# 0004: Plain-English search returns filters, never text

Status: accepted, November 2026

## Context
Buyers type requests like "counter-drone firms near Salisbury Plain with Cyber Essentials Plus". Search must turn that into Tally's filters. It is the only part that costs per use and the only place untrusted text reaches a model.

## Options
1. Claude Haiku through the Anthropic API, called from the server route.
2. An open model on Cloudflare Workers AI.
3. Keyword search only.

## Decision
Option 1, with keyword search as the fallback. The model may only return filter settings, which are checked against the filter schema and the known capability list; anything else is dropped. Nothing the model writes is shown to anyone or stored. The route is rate-limited and budget-capped, and falls back to keyword search when a limit is reached. Search text is not logged.

## Consequences
At worst a strange request produces a wrong filter. Running cost is bounded. The model sits behind one function, so it can be swapped.

## Revisit when
The budget is regularly reached, or pricing changes substantially.
