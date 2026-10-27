# 0003 — The Market Browser reads ESI order books; Build Plans keep Fuzzwork

## Status

Accepted (2026-08-30). Amends ADR 0002 for `/market` only; 0002 still governs
Build Plan pricing.

## Context

The Market Browser is being rebuilt to show what a trader actually needs: every
buy and sell order for one item, by station, with quantity, order range,
minimum volume and expiry. Fuzzwork aggregates cannot express that shape — an
aggregate is one best bid and one best ask per station, so there are no rows to
list, whatever the layout around them looks like.

ADR 0002 set Fuzzwork aside from ESI region orders because the whole-region book
is enormous (The Forge ≈ 412 pages) and rate-limited, and it reserved region
orders "for opt-in live depth views." That reservation is now being taken up,
and the size objection does not apply to it: `/markets/{region_id}/orders`
accepts a `type_id`, and one item in the busiest region in the game comes back
as a single page — Tritanium in The Forge measured 158 orders, `X-Pages: 1`,
verified 2026-08-30. The endpoint needs no authentication, so `/market` keeps
its property of requiring a login but zero ESI scopes.

## Decision

The Market Browser reads order books from ESI, one request per item and region,
cached for the 300 seconds ESI itself caches them. Build Plans continue to price
materials through Fuzzwork aggregates, which is the right shape for pricing a
bill of materials in one batch.

## Consequences

- The app carries two price sources on purpose. They answer different
  questions: "what is this worth, roughly, in bulk" and "who is selling this,
  where, right now."
- Order rows carry a `location_id` that may be a player structure, whose name
  needs a scope the app does not take. Those rows are shown with the solar
  system and security status instead of a name, never hidden — in the measured
  Tritanium book, 18% of orders sat in player structures, so hiding them would
  have misreported a fifth of the market.
- Region coverage is bounded by what the snapshot knows: a region absent from
  the baked data cannot render its locations, which is why the region list is
  baked alongside the systems and stations rather than refreshed separately.
