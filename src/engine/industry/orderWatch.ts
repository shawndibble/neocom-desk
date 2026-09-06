/**
 * "Watch Open Order" fill detection (issue #525): how many units of a
 * watched sell order have sold since the watch started, from a manual
 * refresh's `volume_remain` reading — this app polls no ESI endpoint in the
 * background for orders, so a Production Run's realized quantity only moves
 * when the pilot asks it to.
 *
 * Only a *drop* counts. `volume_remain` should only ever fall (units sell)
 * or hold (nothing happened since the last refresh); if it were ever read
 * higher — the order was cancelled and reissued with different remaining
 * volume, or a legitimately impossible ESI hiccup — that is not a negative
 * fill, so it clamps to zero rather than reporting a sale reversal.
 */
export function computeOrderFillQuantity(
  initialVolumeRemain: number,
  currentVolumeRemain: number
): number {
  return Math.max(0, initialVolumeRemain - currentVolumeRemain);
}
