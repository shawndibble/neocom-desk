# 0008 — Radix `Tooltip` for collision-aware placement

## Status

Accepted (2026-09-02). Amends ADR 0004 — `Tooltip` moves from hand-rolled CSS
to Radix; ContextMenu, DropdownMenu and Select are unaffected.

## Context

`Tooltip` was hand-rolled CSS (`:hover`/`:focus-within` on a wrapping span,
always positioned `bottom-full`/centered on the trigger) on the premise,
recorded in ADR 0004, that "the platform supports tooltips well" enough not
to need a library. That premise doesn't hold at the viewport edge: a
fixed-position bubble with no collision awareness renders partially or
entirely off-screen for any trigger near the top, side, or inside a scrolling
container, with no way to read it. Fixing that in plain CSS means
reimplementing flip/shift positioning and its update loop (reposition on
scroll and resize) by hand — essentially rebuilding what Radix's `Tooltip`
(floating-ui under the hood) already ships.

## Decision

Wrap Radix's `Tooltip` primitive in `src/components/ui/Tooltip.tsx`, keeping
the existing external API (`<Tooltip content>`, `<InfoTooltip>`) so no call
site changes. Radix handles hover/focus, collision-aware flip/shift
placement, and portaling to `document.body` (so a clipping scroll ancestor
can't cut the bubble off either); the component still owns its own
touch-and-hold long-press reveal and auto-dismiss, layered on top via a
controlled `open` state — Radix's own pointer handling explicitly ignores
touch and expects the app to supply this.

## Consequences

- `aria-describedby` is now wired onto the trigger only while the tooltip is
  open, matching Radix's default and standard practice, rather than being
  always present and pointing at a `display:none` node. Any test asserting
  it at rest (without hovering/focusing first) needed updating.
- The tooltip bubble is only in the DOM while open (Radix mounts it via
  `Presence`), not always-present-but-hidden as before.
- A `<Tooltip>` child must accept and forward a `ref` — Radix's `Trigger
asChild` needs the underlying DOM node for both positioning and its
  hover/focus/pointer handlers. `Button` (`src/components/ui/Button.tsx`)
  didn't forward its ref before this change; it now does, the same way
  `IconButton` already did.
- Radix closes any other open tooltip document-wide the moment a new one
  opens, so two tooltips no longer show at once (previously possible, since
  each was an independent CSS `:hover`/`:focus-within`). Not something the
  app relied on.
- Recharts' own `Tooltip` in `PriceHistoryChart.tsx` is a different
  component entirely (the chart library's tooltip) and is unaffected.
