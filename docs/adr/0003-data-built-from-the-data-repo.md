# 0003: Company data stays in its own repository and is built into the site

Status: accepted, November 2026

## Context
Tally's data is one markdown page per company in a public repository under CC BY 4.0, readable on GitHub, in Obsidian, or by an AI assistant. The site code is licensed differently.

## Options
1. Two repositories: data and site. The site build reads the data, including its history for the growth-over-time view.
2. One repository for both. Simpler, but mixes licences and clutters the data for people who only want the markdown.
3. A database. A runtime store for data that changes weekly. No benefit at this size.

## Decision
Option 1. A merge to the data repository triggers a rebuild of the site.

## Consequences
No runtime database. The data schema is a public interface (see `CONTEXT.md`) and is versioned. The site never becomes the place where data is edited.

## Revisit when
Data needs editing more often than the weekly cycle, or the build becomes slow.
