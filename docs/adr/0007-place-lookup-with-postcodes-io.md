# 0007: Near-me search looks places up with postcodes.io from the browser

Status: accepted, November 2026

## Context
Buyers want the companies within reach of a place: an office, a supplier, a town. They type a full postcode, the first part of one, or a town name. Turning that into a point needs a geocoder. Tally costs nothing to run, has one server route (0001), and sends nothing about its visitors anywhere it does not need to.

## Options
1. postcodes.io, called from the browser when the buyer presses Find. Free, open source, no key, built on open Ordnance Survey and Office for National Statistics data.
2. A place index built into the site. Outward codes and place names would fit, but full postcodes are about 1.7 million points, far beyond the page's JavaScript and data budget.
3. A commercial geocoding service. Metered and keyed, and would need a server route to hold the key.

## Decision
Option 1. Typed text is checked against strict patterns first and refused in the page if it does not fit. Only the typed place is sent, with no cookies or referrer, and only on Find (no autocomplete). The answer is treated as untrusted: only a name that fits the place-name pattern and a point inside the UK are used. The CSP allows the host for `connect-src` only. The resolved place, not the typed text, is held in the URL, so a shared link does not call the lookup again.

## Consequences
No cost per search and no new server code. Near-me search depends on postcodes.io being up; if it is not, the page says so and the rest of Tally is unaffected.

## Revisit when
postcodes.io becomes unreliable or changes its terms. A self-hosted postcodes.io, or a built-in outward-code and place index, are the fallbacks.
