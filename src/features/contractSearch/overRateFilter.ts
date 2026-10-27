/**
 * The Courier board's over-rate filter values, shared between `CourierResults.tsx`
 * (the control itself) and `courierFilterPref.ts` (the remembered default) — a
 * plain module rather than a re-export from the component file, which
 * `react-refresh/only-export-components` rejects a value export from.
 *
 * Both directions, because the flag reads two ways: a hauler avoiding the
 * documented bait wants these gone, and one who has read the conditions and
 * judged them for themselves wants only these. Neither reading is the app's to
 * make, so it offers both and defaults to neither.
 */
export const OVER_RATE_FILTERS = ['all', 'only', 'hide'] as const;
export type OverRateFilter = (typeof OVER_RATE_FILTERS)[number];
