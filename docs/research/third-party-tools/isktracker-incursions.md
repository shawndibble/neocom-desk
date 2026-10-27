# Isktracker - Incursions

Thread: https://forums.eveonline.com/t/isktracker-incursions/519252 | read 2026-10-07 (.json summary; created 2026-09-29, no replies)

## What

Not a tool release. Author (Amaterasu) building an incursion ISK tracker; reports ESI cache mismatch: `GET /characters/{id}/wallet/journal/` caches up to 3600 s, `GET /characters/{id}/wallet/` 120 s. Journal-by-ref_type income trackers freeze mid-session. Asks CCP for 5-10 min journal cache (ESI-issues #546).

## Features

| Feature                                             | Tool does | Neocom Desk                                              | Evidence                                                                                        |
| --------------------------------------------------- | --------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Income by ref_type (incursion payouts) from journal | planned   | HAVE (filter) / PARTIAL (no per-activity income summary) | wallet.md: Ref type select, bounty faction summary; no incursion/ratting income rollup grep hit |
| Balance vs journal drift                            | pitfall   | unknown                                                  | see below                                                                                       |

## Calculations worth borrowing

- Sum journal by `ref_type` over a session window (e.g. `incursion` ref types, bounty_prizes) for ISK/hour.
- Reconcile: balance delta (120 s fresh) minus journal sum = "not yet in journal" estimate.

## Candidate gaps

1. Wallet: show journal data age and "balance moved by X, journal not caught up" hint; optional session ISK/hour by ref_type. Confidence: inferred (single post, no replies). Check wallet.md for DataAge badge first.

## Pitfall

Journal cache 3600 s vs balance 120 s: never present journal-derived live totals as current without an age label (our README gap 10 "stale data unlabeled" is the same class).

## Out of scope

CCP-side cache change request.
