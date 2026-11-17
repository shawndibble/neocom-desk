/**
 * The Corp Tax Book's value lists that the client mirrors (resolving in the app). Kept in a module
 * with no imports so the root test suite's parity test (`functionsMirror.test.ts`) can read them
 * without the functions package's dependencies.
 */

/** Mirror of the client's `TAX_CONTACT_MAX_CHARACTERS` (`functionsMirror.test.ts` keeps them equal). */
export const TAX_CONTACT_MAX_CHARACTERS = 5;

/** Who received a transfer, as the member's own wallet journal names it. */
export const TRANSFER_RECIPIENTS = ['corporation', 'character', 'otherCorporation'] as const;

/** What checking one claimed transfer against the book found. */
export const CLAIM_CHECK_RESULTS = [
  'found',
  'division',
  'notSynced',
  'tooOld',
  'notFound',
  'ambiguous',
  'person',
  'otherCorp',
] as const;

/**
 * What a member says about a day (resolving in the app): `payee`, the ore went to another Payee
 * (#6206); `quantity`, the book recorded more ore than they mined; `rate`, the book's rate is
 * higher than the one that applies; `notPaying`, they will not pay it. Mirrors the engine's
 * `DisputeKind` (`src/engine/corpTaxBook/disputes.ts`).
 */
export const DISPUTE_KINDS = ['payee', 'quantity', 'rate', 'notPaying'] as const;

/**
 * A running account's late notices (#6294): when one is due — `behind`, the Miner's oldest unpaid
 * day is `days` old; `dayOfMonth`, on that day of each month while they owe — the least owed for
 * one, and the days before another. Mirrors `src/engine/corpTaxBook/notices.ts`.
 */
export const NOTICE_AFTER_KINDS = ['behind', 'dayOfMonth'] as const;
export const NOTICE_DEFAULTS = {
  after: { kind: 'behind', days: 14 },
  minimum: 10_000_000,
  cooldownDays: 7,
} as const;
/** A running account's per-day tolerance, in percent; mirrors `DAY_SETTLE_TOLERANCE_PCT`. */
export const DAY_TOLERANCE_PCT_DEFAULT = 0.5;
