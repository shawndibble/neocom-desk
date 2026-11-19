# Scope decisions — Contract ask estimate stays out of totals (issue #6431)

_Recorded 2026-11-18 · issue #6431._

- **A contract-only hull shows an ask median, marked, never in a total.** A type
  with no market average price (Titans, supercarriers) and at least 5 clean
  single-item contracts in the Public Contract Offers snapshot shows "≈ median"
  in its Assets Value cell, tooltip "Ask median, N contracts". Clean excludes
  zero-price, item-swap, PLEX, bundle, expired, blueprint and bid-only asks;
  below 5 the row stays a dash. Asks are listings, not sales, so unlike the
  abyssal estimate (decision 20261016-105151) it does not flow through
  `assetStackValue`: tree totals, sort, the min-value filter and CSV ignore it,
  and a line under the level header counts the estimated stacks and what they
  would add. Net worth and Appraisal never read it. Rejected: adding it to the
  total flagged as an estimate (a snapshot change would jump the total).
  Rows with children (a fitted ship) show no hull value today and still don't.
  Types come from the owned list, then the offer index (types under 5 offers
  download nothing).
