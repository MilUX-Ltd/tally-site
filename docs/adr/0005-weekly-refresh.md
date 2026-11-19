# 0005: A weekly refresh proposes data changes as one pull request

Status: accepted, November 2026

## Context
A directory that goes stale fails its users. New companies appear in public cluster directories and elsewhere each week; events come and go.

## Options
1. A scheduled research agent that gathers changes from public sources and opens one pull request on the data repository.
2. A scripted job in CI calling a model API. Costs per run and cannot do open research well.
3. A manual monthly refresh. Free, but it is how directories go stale.

## Decision
Option 1. Every change is public-source research. A person reviews and merges the pull request; nothing publishes without that merge.

## Consequences
The data stays current at little cost, with a human approving every change. The steps are written down, so the job can move to another runner.

## Revisit when
Weeks are missed, or the review takes too long.
