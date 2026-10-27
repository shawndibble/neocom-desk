import { diffRoster } from '../corp/members';
import { diffJobReady } from './jobReady';

/* -------------------------------------------------------------------------- */
/* Corp: structure fuel low                                                   */
/* -------------------------------------------------------------------------- */

export interface StructureFuelEntrySnapshot {
  structureId: number;
  name: string;
  /** Absent from ESI once a structure has run dry — parsed to `null`, never a stale date. */
  fuelExpiresMs: number | null;
  /**
   * The user's chosen lead time, in ms, as it stood when this poll ran (issue
   * #299) — baked in per entry at `pollDomains/`'s `load()` time, since
   * `DomainDiff` itself is synchronous and cannot read the character's
   * preference. Carried on every entry of one poll rather than as a snapshot
   * scalar, matching every other domain's `{ nowMs, <entries> }` shape.
   */
  thresholdMs: number;
}

export interface StructureFuelSnapshot {
  entries: readonly StructureFuelEntrySnapshot[];
  nowMs: number;
}

export interface StructureFuelLowFire {
  eventId: 'structureFuelLow';
  characterId: number;
  structureId: number;
  structureName: string;
  thresholdMs: number;
  /**
   * The structure's `fuel_expires` at fire time (issue #348: Occurrence Key
   * input) — this diff's own re-fire identity is `(structureId,
   * fuelExpiresMs)`, not `structureId` alone: a refuel starts a new
   * countdown, distinct from the one that already fired.
   */
  fuelExpiresMs: number;
}

/**
 * Fires per structure whose remaining fuel has newly crossed under the
 * Character's chosen lead time (issue #299) — additive to CCP's own
 * `StructureFuelAlert`, which fires at its own fixed, late point (#274/#300),
 * not a duplicate of it.
 *
 * Window-crossing, on `diffPlanetaryExtractorExpiring`'s precedent rather than
 * `diffIndustryJobComplete`'s "newly in the past" shape: `remaining <=
 * thresholdMs` stays true for as long as the structure holds that little fuel,
 * so an edge-trigger is required or every later poll would re-fire. Both
 * halves of that precedent apply here too — `fuelExpiresMs > next.nowMs` (not
 * already run dry; that transition is CCP's own alert's territory, not this
 * one's) and the crossing itself.
 *
 * "Is it inside the window now" is judged against `entry.thresholdMs` — the
 * setting in force *this* poll. "Was it already inside, and so already
 * reported" is judged against **`prevEntry.thresholdMs`**, the setting that
 * was in force *the poll `prev` was captured under* — not `entry.thresholdMs`
 * again. Reusing the current threshold for both would make a Character who
 * *raises* the lead time (1 day -> 7) retroactively read every earlier poll as
 * "already inside" the new, wider window, so a structure genuinely newly
 * eligible would never fire (AC4: a threshold change must take effect on the
 * very next poll). Comparing each side to the threshold that was actually
 * live when it was measured is what makes both directions — raising and
 * lowering — correct without special-casing either.
 *
 * A structure's identity for "observed before" is `(structureId,
 * fuelExpiresMs)`: a refuel pushes `fuel_expires` to a new, later instant,
 * which is a new countdown and fires again when it later crosses the same
 * lead time — the same reasoning `diffPlanetaryExtractorExpiring` applies to
 * `(pinId, expiryTimeMs)`. A structure with no counterpart in `prev` (new to
 * this poll) is treated as not-previously-inside, so one discovered already
 * under threshold still fires once.
 */
export function diffStructureFuelLow(
  characterId: number,
  prev: StructureFuelSnapshot | undefined,
  next: StructureFuelSnapshot
): StructureFuelLowFire[] {
  if (!prev) return [];
  const prevByStructure = new Map(prev.entries.map((entry) => [entry.structureId, entry]));
  const fires: StructureFuelLowFire[] = [];
  for (const entry of next.entries) {
    if (entry.fuelExpiresMs === null) continue;
    const remainingNow = entry.fuelExpiresMs - next.nowMs;
    if (remainingNow > entry.thresholdMs) continue;
    if (remainingNow <= 0) continue;
    const prevEntry = prevByStructure.get(entry.structureId);
    const observedBefore =
      prevEntry !== undefined && prevEntry.fuelExpiresMs === entry.fuelExpiresMs;
    if (observedBefore && prevEntry.fuelExpiresMs !== null) {
      const remainingPrev = prevEntry.fuelExpiresMs - prev.nowMs;
      if (remainingPrev <= prevEntry.thresholdMs) continue;
    }
    fires.push({
      eventId: 'structureFuelLow',
      characterId,
      structureId: entry.structureId,
      structureName: entry.name,
      thresholdMs: entry.thresholdMs,
      fuelExpiresMs: entry.fuelExpiresMs,
    });
  }
  return fires;
}

/* -------------------------------------------------------------------------- */
/* Corp: industry jobs                                                        */
/* -------------------------------------------------------------------------- */

export interface CorpIndustryJobEntrySnapshot {
  jobId: number;
  endMs: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

export interface CorpIndustryJobSnapshot {
  entries: readonly CorpIndustryJobEntrySnapshot[];
  nowMs: number;
}

export interface CorpIndustryJobNotificationFire {
  eventId: 'corpIndustryJobReady';
  characterId: number;
  jobId: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
  /** The job's `end_date` — already past when this fires, so it dates the feed row. */
  endMs: number;
}

/**
 * The corp analogue of `diffIndustryJobComplete` (issue #299) — identical
 * edge-triggered shape, against the corporation's industry jobs rather than
 * the Character's own. `loadCorporationIndustryJobs` excludes delivered jobs
 * the same way the personal loader does, so a job can sit in `next.entries`
 * for many polls after finishing; `endMs <= prev.nowMs` is what stops a
 * re-fire on every one of those.
 */
export function diffCorpIndustryJobReady(
  characterId: number,
  prev: CorpIndustryJobSnapshot | undefined,
  next: CorpIndustryJobSnapshot
): CorpIndustryJobNotificationFire[] {
  return diffJobReady('corpIndustryJobReady', characterId, prev, next);
}

/* -------------------------------------------------------------------------- */
/* Corp: member roster                                                        */
/* -------------------------------------------------------------------------- */

export interface CorpRosterMemberSnapshot {
  characterId: number;
}

export interface CorpRosterSnapshot {
  entries: readonly CorpRosterMemberSnapshot[];
  nowMs: number;
}

export interface CorpMemberJoinedFire {
  eventId: 'corpMemberJoined';
  characterId: number;
  memberCharacterId: number;
}

export interface CorpMemberLeftFire {
  eventId: 'corpMemberLeft';
  characterId: number;
  memberCharacterId: number;
}

function rosterIds(snapshot: CorpRosterSnapshot | undefined): readonly number[] | undefined {
  return snapshot?.entries.map((entry) => entry.characterId);
}

/**
 * Thin adapters onto `engine/corp/members.ts`'s `diffRoster` (#297/#333) —
 * this ticket (#299) consumes that diff, it does not recompute it.
 * `diffRoster` already answers "no change" when `prev` is `undefined`, which
 * is this module's usual first-poll-fires-nothing rule expressed one layer
 * down.
 */
export function diffCorpMemberJoined(
  characterId: number,
  prev: CorpRosterSnapshot | undefined,
  next: CorpRosterSnapshot
): CorpMemberJoinedFire[] {
  const { joined } = diffRoster(rosterIds(prev), rosterIds(next) ?? []);
  return joined.map((memberCharacterId) => ({
    eventId: 'corpMemberJoined' as const,
    characterId,
    memberCharacterId,
  }));
}

export function diffCorpMemberLeft(
  characterId: number,
  prev: CorpRosterSnapshot | undefined,
  next: CorpRosterSnapshot
): CorpMemberLeftFire[] {
  const { left } = diffRoster(rosterIds(prev), rosterIds(next) ?? []);
  return left.map((memberCharacterId) => ({
    eventId: 'corpMemberLeft' as const,
    characterId,
    memberCharacterId,
  }));
}

/* -------------------------------------------------------------------------- */
/* Corp: wallet threshold                                                     */
/* -------------------------------------------------------------------------- */

export interface CorpWalletJournalEntrySnapshot {
  id: number;
  amount: number | null;
}

export interface CorpWalletDivisionSnapshot {
  division: number;
  balance: number;
  /**
   * Only the master division's journal is fetched (GLOSSARY.md round 43): ESI
   * publishes no all-divisions journal and the seven are separately paginated
   * and role-gated, so every other division's `journal` is empty here — its
   * `balance` still participates in the balance-below check below, which
   * costs nothing extra since `/wallets` already returns every division in
   * one call.
   */
  journal: readonly CorpWalletJournalEntrySnapshot[];
  /** The Character's current thresholds, baked in at `load()` time — see `StructureFuelEntrySnapshot`. */
  balanceFloorIsk: number;
  transactionCeilingIsk: number;
}

export interface CorpWalletSnapshot {
  divisions: readonly CorpWalletDivisionSnapshot[];
  nowMs: number;
}

export type CorpWalletThresholdFire =
  | {
      eventId: 'corpWalletThreshold';
      characterId: number;
      kind: 'balanceBelow';
      division: number;
      balance: number;
      thresholdIsk: number;
    }
  | {
      eventId: 'corpWalletThreshold';
      characterId: number;
      kind: 'transactionAbove';
      division: number;
      amount: number;
      thresholdIsk: number;
      /** The journal entry's own id (issue #348: Occurrence Key input) — this diff's own natural id for this case (see below). */
      journalEntryId: number;
    };

/**
 * Fires on either of two independent conditions (issue #299), deliberately
 * not modelled on `diffWalletBalanceChanged` (which would flood at corp
 * transaction volume):
 *
 * - **`balanceBelow`** — a division's balance newly at or under the
 *   Character's floor, edge-triggered across every division `/wallets`
 *   returns (one call already prices in all seven).
 * - **`transactionAbove`** — a single journal entry, on the master division
 *   only, whose absolute amount newly exceeds the Character's ceiling.
 *   High-water-marked by entry id, `diffWalletBalanceChanged`'s precedent: an
 *   entry once seen is never re-evaluated even if the ceiling is lowered
 *   later, so changing the setting affects only transactions from then on.
 *
 * `prev === undefined` fires nothing, this module's rule throughout — a
 * division discovered already under floor, or a backlog of large historical
 * transactions, must not flood the first time this poll has a baseline.
 */
export function diffCorpWalletThreshold(
  characterId: number,
  prev: CorpWalletSnapshot | undefined,
  next: CorpWalletSnapshot
): CorpWalletThresholdFire[] {
  if (!prev) return [];
  const prevByDivision = new Map(prev.divisions.map((division) => [division.division, division]));
  const fires: CorpWalletThresholdFire[] = [];
  for (const division of next.divisions) {
    if (division.balance <= division.balanceFloorIsk) {
      const prevDivision = prevByDivision.get(division.division);
      // Judged against `prevDivision.balanceFloorIsk` — the floor that was
      // live when `prevDivision.balance` was measured — never
      // `division.balanceFloorIsk` again: reusing the current floor for both
      // sides would make raising it retroactively read every earlier poll as
      // "already under," so a division genuinely newly eligible would never
      // fire (same reasoning `diffStructureFuelLow` documents in full).
      const wasAbove =
        prevDivision === undefined || prevDivision.balance > prevDivision.balanceFloorIsk;
      if (wasAbove) {
        fires.push({
          eventId: 'corpWalletThreshold',
          characterId,
          kind: 'balanceBelow',
          division: division.division,
          balance: division.balance,
          thresholdIsk: division.balanceFloorIsk,
        });
      }
    }

    if (division.journal.length === 0) continue;
    const prevDivision = prevByDivision.get(division.division);
    const maxPrevId = (prevDivision?.journal ?? []).reduce(
      (max, entry) => Math.max(max, entry.id),
      0
    );
    for (const entry of division.journal) {
      if (entry.id <= maxPrevId) continue;
      if (entry.amount === null) continue;
      if (Math.abs(entry.amount) < division.transactionCeilingIsk) continue;
      fires.push({
        eventId: 'corpWalletThreshold',
        characterId,
        kind: 'transactionAbove',
        division: division.division,
        amount: entry.amount,
        thresholdIsk: division.transactionCeilingIsk,
        journalEntryId: entry.id,
      });
    }
  }
  return fires;
}
