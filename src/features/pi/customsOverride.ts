/**
 * The customs rate a pilot sets for a system themselves — Editable Data, so it
 * syncs across their devices (CONTEXT.md's "Editable Data" glossary entry).
 *
 * ## Why the Advisor needs one at all
 *
 * `customsRate.ts` derives a rate from the system's security band and the
 * character's Customs Code Expertise, and the Advisor showed it read-only on
 * the reasoning that it knows exactly which system it is displaying — unlike
 * the Plan tab, which answers for no particular system and therefore asks.
 *
 * That reasoning only holds in highsec, where the office is NPC and the
 * formula is exact. Outside it the office is player-owned, its tax is in no
 * ESI field, and `defaultCustomsRate` returns **0** — so every margin on a
 * lowsec, nullsec or wormhole colony was overstated by whatever the POCO owner
 * actually charges, with nothing on screen a pilot could do about it. A
 * vestigial lowsec NPC office charges 17% the skill cannot touch either.
 *
 * So the derived figure becomes a default and the pilot can say otherwise. It
 * stays a default rather than being replaced: a highsec pilot should never
 * have to type a number the app can work out exactly.
 *
 * ## One key for every system, not one per system
 *
 * `mergeSettings` is whole-value last-write-wins per key and
 * `SYNCED_SETTING_KEYS` is an exact-match allow-list, so a per-system key
 * scheme cannot be expressed without weakening that list into a prefix match.
 * Same trade `syncedPreferences.ts` documents and accepts: two devices editing
 * *different* systems' rates before either syncs can have one clobber the
 * other. It takes two devices open at once, and a customs rate is a number a
 * pilot sets about once per POCO.
 *
 * Never deleted as a key — clearing one system's override empties an entry,
 * and the blob stays valid — so the tombstone-expiry edge in `merge.ts` does
 * not bite it.
 *
 * These functions are pure: the Dexie read and the `setSyncedSetting` write
 * live in `AdvisorPanel.tsx`, the same split `syncedPreferences.ts` uses.
 */

export const SYNCED_PI_CUSTOMS_KEY = 'sync.piCustomsRates';

/** Solar system id to customs rate, as a fraction — 0.1 is 10%. */
export type CustomsOverrides = Record<number, number>;

/** The most an office can take. A POCO owner may genuinely set 100%. */
const MAX_RATE = 1;

function usableRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_RATE;
}

/**
 * The stored blob, validated.
 *
 * Every entry is checked rather than trusted: this value is whatever the last
 * device to sync wrote, which may be an older version of this app or a row a
 * user edited by hand. A rate outside 0-100% is not a customs office, and a
 * `NaN` would quietly price every chain in that system at nothing.
 */
export function parseCustomsOverrides(raw: unknown): CustomsOverrides {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: CustomsOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const systemId = Number(key);
    if (!Number.isInteger(systemId) || systemId <= 0) continue;
    if (!usableRate(value)) continue;
    out[systemId] = value;
  }
  return out;
}

/**
 * What this system's chains are costed at: the pilot's own figure where they
 * gave one, and the derived rate otherwise.
 *
 * A stored `0` is a real answer — a POCO of their own, or one their corp does
 * not tax them at — so this tests for presence rather than truthiness.
 */
export function customsRateFor(
  systemId: number,
  overrides: CustomsOverrides,
  derived: number
): number {
  const own = overrides[systemId];
  return own === undefined ? derived : own;
}

/**
 * The overrides with one system set, clamped into what an office can charge.
 *
 * A non-numeric rate is refused outright rather than clamped: a half-typed
 * field reads `NaN`, and clamping that to zero would silently declare the
 * system tax-free.
 */
export function withCustomsOverride(
  overrides: CustomsOverrides,
  systemId: number,
  rate: number
): CustomsOverrides {
  if (!Number.isFinite(rate)) return overrides;
  return { ...overrides, [systemId]: Math.min(MAX_RATE, Math.max(0, rate)) };
}

/** The overrides with one system dropped back to its derived rate. */
export function withoutCustomsOverride(
  overrides: CustomsOverrides,
  systemId: number
): CustomsOverrides {
  if (overrides[systemId] === undefined) return overrides;
  const next = { ...overrides };
  delete next[systemId];
  return next;
}
