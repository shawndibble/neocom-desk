# 0002 — Market prices from Fuzzwork aggregates, ESI as fallback

## Status

Accepted (2026-08-29)

## Context

Build-vs-buy needs lowest-sell prices per item at a chosen trade hub. ESI's
per-region order books are enormous (The Forge ≈ 412 pages) and rate-limited
(12,000 tokens/15 min). Third-party options: Fuzzwork aggregates (CORS *, no
key, per-station stats, batch queries), Janice (API key would be exposed in
SPA source), EVE Tycoon and Adam4EVE (no CORS). Verified 2026-08-29.

## Decision

Fuzzwork market aggregates are the primary price source
(`market.fuzzwork.co.uk/aggregates/`). ESI `/markets/prices/` provides a
global fallback; ESI region orders are reserved for opt-in live depth views.

## Consequences

- Single dependency on a community service with no SLA (~30-minute data).
  Acceptable: prices feed estimates, not trades. Fallback path exists.
- Numeric values arrive as JSON strings and must be parsed.
- If Fuzzwork dies, swapping the aggregator is one adapter module.
