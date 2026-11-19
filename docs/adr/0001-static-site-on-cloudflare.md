# 0001: A static site on Cloudflare, with one small server route for search

Status: accepted, November 2026

## Context
Tally is public and read-only, with no accounts. It must cost as close to nothing as possible to run. MilUX's main site already runs on Cloudflare.

## Options
1. Cloudflare Workers static assets. Free for static traffic, same platform as the main site.
2. GitHub Pages. Free, but no server side for search.
3. A container host. Pays for an always-on server the product does not need.

## Decision
Option 1. Everything is static except one route that turns a plain-English request into filters (0004).

## Consequences
Hosting costs nothing. Every pull request gets its own preview URL. The build output is plain files, so it could move to any static host.

## Revisit when
Traffic approaches the free allowance, or the free terms change.
