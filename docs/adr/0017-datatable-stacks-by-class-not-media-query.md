# 0017 — DataTable stacks by a class, not a media query

## Status

Accepted (2026-10-03)

## Context

Below `sm` a `DataTable` turns each row into a card (DESIGN.md §4a). The
switch was a CSS media query, `@media (width < 40rem)`, around every
`.dt-stack` rule in `src/styles/index.css`, so the markup stayed identical at
every width and no JS took part.

A media query sees the viewport, not the table. On a tablet-width window
with the rail open, the Hauling panel is about 510px wide: narrower than a
phone's, but still a table, because the viewport is 768px. Its compact
columns need about 740px, so a third of every row scrolled out of sight
inside the panel, including the Bring box, the row's one editable control.
No media query can tell that table apart from one with room to spare. A
container query could, but the card rules would then have to be written
twice, once per query, since CSS has no "this media query _or_ this
container" condition.

## Decision

The card rules key off a class, `dt-stacked`, instead of the media query.
`DataTable` sets it:

- below `sm`, from `useIsPhone` (`max-width: 39.999rem`, the same
  breakpoint), for every table with `responsive="stack"`. Every table stacks
  exactly where it did before.
- when the caller passes `stacked`, a boolean that replaces the viewport
  check for that table. A table that knows its own width (Hauling measures
  its wrapper) uses it to stack when the width is too narrow for its
  columns.

`dt-stack` still marks a table that _can_ stack, so existing tests and
callers that look for it are unaffected. `DataTable`'s other phone checks
(row-height estimates, grouping, the `mobileSort` bar) read the same
effective value, so a forced card behaves like a phone card.

## Consequences

- The card no longer appears without JS. That cost nothing in practice: the
  app is a client-rendered SPA, and `useIsPhone` reads `matchMedia`
  synchronously on first render, so there is no first-paint flash.
- A caller that forces `stacked` owns its own `max-sm:`/`sm:` cell classes:
  they still follow the viewport, so a forced card must choose those
  classes in JS (Hauling does).
- jsdom never matches `matchMedia`, so tests see the table layout, as they
  did when the media query never matched there.
