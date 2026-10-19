import { colonyStatus } from '../pi/colonyStatus';

export interface ColonyExtractorSnapshot {
  pinId: number;
  expiryTimeMs: number;
  /**
   * The Character's current `extractorExpiringLeadHours` preference (issue
   * #750), converted to ms and baked in per entry at `pollDomains/`'s
   * `colonyDomain.load()` time — the same `StructureFuelEntrySnapshot.thresholdMs`
   * pattern `structureFuelLowDays` uses, since `DomainDiff` itself is
   * synchronous and cannot read the character's preference.
   */
  thresholdMs: number;
  /**
   * When this program was installed, or absent when ESI omitted it —
   * `install_time` is spec-optional (`engine/pi/colonyPins.ts`).
   *
   * Not part of any warning: `expiry_time` alone answers idle and
   * expiring-soon (ADR 0005). It is here for
   * `disprovenExtractorOccurrences`, which needs to know whether a
   * replacement program went in *before* the one it replaced ran out —
   * the only evidence on the wire that an already-delivered alert was
   * about something that never happened.
   */
  installTimeMs?: number;
}

export interface ColonySnapshotEntry {
  planetId: number;
  extractors: readonly ColonyExtractorSnapshot[];
}

export interface PlanetarySnapshot {
  colonies: readonly ColonySnapshotEntry[];
  nowMs: number;
}

export interface PlanetaryNotificationFire {
  eventId: 'planetaryExtractionDone';
  characterId: number;
  planetId: number;
  /**
   * Soonest `expiry_time` across the colony's extractors (issue #348:
   * Occurrence Key input) — fixed at program install, so it identifies which
   * extractor's expiry actually crossed the colony into idle regardless of
   * which poll observed it.
   */
  expiryTimeMs: number;
}

function colonyIdle(entry: ColonySnapshotEntry, nowMs: number): boolean {
  return colonyStatus(
    entry.extractors.map((e) => ({ pinId: e.pinId, expiryTimeMs: e.expiryTimeMs })),
    nowMs
  ).idle;
}

/**
 * Fires per colony whose extractor programs newly read idle (ADR 0005:
 * `engine/pi/colonyStatus.ts`'s `expiry_time`-only idle read, never
 * `contents[].amount`/`last_cycle_start`). Edge-triggered on the transition
 * into idle, evaluating both snapshots at their own `nowMs` the same way
 * `diffCharacterNotTraining` compares `headStatus(prev)` against
 * `headStatus(next)` — a colony missing from `prev.colonies` (first time
 * this character's poll has seen it) is treated as not-previously-idle, so a
 * colony discovered already idle still fires once. `prev === undefined` (a
 * character's first-ever poll, e.g. a newly added alt) is an empty snapshot,
 * so every colony already idle fires once rather than never.
 */
export function diffPlanetaryExtractionDone(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): PlanetaryNotificationFire[] {
  const prevByPlanet = new Map((prev?.colonies ?? []).map((c) => [c.planetId, c]));
  const fires: PlanetaryNotificationFire[] = [];
  for (const colony of next.colonies) {
    if (!colonyIdle(colony, next.nowMs)) continue;
    const prevColony = prevByPlanet.get(colony.planetId);
    if (prev && prevColony && colonyIdle(prevColony, prev.nowMs)) continue;
    fires.push({
      eventId: 'planetaryExtractionDone',
      characterId,
      planetId: colony.planetId,
      expiryTimeMs: Math.min(...colony.extractors.map((e) => e.expiryTimeMs)),
    });
  }
  return fires;
}

/**
 * One warning about one program at one lead time. Shared by the diff that
 * raises these and by `disprovenExtractorOccurrences`, which retracts them:
 * the two must build an identical fire or the retraction addresses a row that
 * does not exist, and nothing would say so.
 */
function extractorExpiringFire(
  characterId: number,
  planetId: number,
  pinId: number,
  thresholdMs: number,
  expiryTimeMs: number
): ExtractorExpiringFire {
  return {
    eventId: 'planetaryExtractorExpiring',
    characterId,
    planetId,
    pinId,
    thresholdMs,
    expiryTimeMs,
  };
}

export interface ExtractorExpiringFire {
  eventId: 'planetaryExtractorExpiring';
  characterId: number;
  planetId: number;
  pinId: number;
  /** The Character's configured lead time, in ms, that this fire crossed. */
  thresholdMs: number;
  /** The program's `expiry_time` (issue #348: Occurrence Key input) — fixed for the program's life. */
  expiryTimeMs: number;
}

/**
 * Fires per extractor program that has newly crossed into its Character's
 * configured lead time (issue #310, made user-selectable in #750) before its
 * `expiry_time`, once per program.
 *
 * The predicate is deliberately **not** `diffCalendarEventStarting`'s "newly
 * in the past" shape. `expiry - now <= 24h` stays true forever once the
 * program has expired, so that shape would tell a user who closed the app at
 * T−30h and reopened at T+5h that a program dead for five hours is "expiring
 * soon". Both halves are required:
 *
 * - the **window-crossing edge** — the program was outside the window at
 *   `prev.nowMs` and is inside it at `next.nowMs`; and
 * - **`expiryTimeMs > next.nowMs`** — it has not already expired. An expired
 *   program is `diffPlanetaryExtractionDone`'s to report, never this event's,
 *   and the boundary lines up exactly: `colonyStatus` reads a colony as idle
 *   from `nowMs >= expiryTimeMs`, which is where this diff stops firing.
 *
 * "Is it inside the lead time now" is judged against `extractor.thresholdMs`
 * — the setting in force *this* poll. "Was it already inside" is judged
 * against **`prevExtractor.thresholdMs`**, the setting in force when `prev`
 * was captured, on `diffStructureFuelLow`'s precedent: comparing each side to
 * the threshold that was actually live when it was measured is what makes a
 * Character raising or lowering the lead time take effect on the very next
 * poll, in both directions, without special-casing either.
 *
 * A program's identity is `(pinId, expiryTimeMs)`, because `expiry_time` is
 * fixed for a program's life: a pin whose expiry changed is carrying a *new*
 * program, and the dead one's position inside a window must not swallow the
 * new one's first crossing. A program with no counterpart in `prev` — a new
 * pin, or a colony this character's poll has not seen before — is treated as
 * not-previously-inside, so one first observed already inside a window still
 * fires once for it, matching `diffPlanetaryExtractionDone`'s treatment of a
 * colony first seen idle. `prev === undefined` fires nothing, like every
 * other diff in this module.
 */
export function diffPlanetaryExtractorExpiring(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): ExtractorExpiringFire[] {
  if (!prev) return [];
  const prevByPlanet = new Map(prev.colonies.map((c) => [c.planetId, c]));
  const fires: ExtractorExpiringFire[] = [];
  for (const colony of next.colonies) {
    const prevColony = prevByPlanet.get(colony.planetId);
    const prevByPin = new Map((prevColony?.extractors ?? []).map((e) => [e.pinId, e]));
    for (const extractor of colony.extractors) {
      if (extractor.expiryTimeMs <= next.nowMs) continue;
      if (extractor.expiryTimeMs - next.nowMs > extractor.thresholdMs) continue;
      const prevExtractor = prevByPin.get(extractor.pinId);
      const observedBefore =
        prevExtractor !== undefined && prevExtractor.expiryTimeMs === extractor.expiryTimeMs;
      if (observedBefore && extractor.expiryTimeMs - prev.nowMs <= prevExtractor.thresholdMs) {
        continue;
      }
      fires.push(
        extractorExpiringFire(
          characterId,
          colony.planetId,
          extractor.pinId,
          extractor.thresholdMs,
          extractor.expiryTimeMs
        )
      );
    }
  }
  return fires;
}

/**
 * The mirror image of the two diffs above: occurrences already announced that
 * this poll can prove never happened.
 *
 * A Scheduled Push is a prediction fired without a re-check (ADR 0010), so a
 * pilot who does a reset run in game with the app closed gets told programs
 * expired that they had already replaced. `projection.ts` hedges the copy so
 * the alert is no longer a false claim; this is the other half, for the row
 * it leaves in the Notification Feed. A restarted program takes a **new**
 * `expiry_time`, hence a new Occurrence Key, so nothing in ordinary polling
 * ever revisits the old row — it would sit there unchallenged forever.
 *
 * The evidence is `install_time`, and one rule covers both events: an
 * occurrence is retractable when the replacement program was already in the
 * ground *before that occurrence's own moment*. For the stop, that moment is
 * the expiry itself. For a lead-time warning it is `expiry - threshold`,
 * which is why a warning is not retracted merely because the program was
 * later replaced: a 24-hour warning that fired while the program was still
 * live was honest, and is very often the nudge the pilot acted on by doing
 * the reset. Dismissing it would erase the alert for having worked.
 *
 * Everything short of proof answers empty, deliberately. A missing
 * `install_time` (spec-optional), a vanished colony or pin, an unchanged
 * expiry, an `install_time` landing exactly on the fire instant, and a
 * program left to run out before being restarted all retract nothing: the
 * cost of a wrong retraction is erasing something true from the pilot's own
 * history, against one stale row for a missed one.
 *
 * Returns fires rather than keys so the caller derives Occurrence Keys
 * through `occurrenceKey.ts`, the same function the projection and the
 * Foreground Poller use — retracting a row means addressing the exact id
 * some other party wrote, and re-deriving that format here would be the one
 * way to silently miss.
 */
export function disprovenExtractorOccurrences(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): (ExtractorExpiringFire | PlanetaryNotificationFire)[] {
  if (!prev) return [];
  const nextByPlanet = new Map(next.colonies.map((c) => [c.planetId, c]));
  const fires: (ExtractorExpiringFire | PlanetaryNotificationFire)[] = [];

  for (const prevColony of prev.colonies) {
    if (prevColony.extractors.length === 0) continue;
    const nextColony = nextByPlanet.get(prevColony.planetId);
    if (!nextColony) continue;
    const nextByPin = new Map(nextColony.extractors.map((e) => [e.pinId, e]));

    /** Was this program already replaced by `firedAtMs` — the alert's own moment? */
    const replacedBefore = (program: ColonyExtractorSnapshot, firedAtMs: number): boolean => {
      const replacement = nextByPin.get(program.pinId);
      if (!replacement || replacement.installTimeMs === undefined) return false;
      // A pin still carrying the same expiry is the same program, not a
      // replacement — program identity is (pinId, expiryTimeMs).
      if (replacement.expiryTimeMs === program.expiryTimeMs) return false;
      return replacement.installTimeMs < firedAtMs;
    };

    for (const program of prevColony.extractors) {
      // `projectColonies` fires this warning at `expiry - threshold`; only
      // a replacement already standing by then makes it a false claim.
      if (!replacedBefore(program, program.expiryTimeMs - program.thresholdMs)) continue;
      fires.push(
        extractorExpiringFire(
          characterId,
          prevColony.planetId,
          program.pinId,
          program.thresholdMs,
          program.expiryTimeMs
        )
      );
    }

    // `planetaryExtractionDone` keys on the colony's soonest expiry, and
    // `colonyStatus` reads a colony as idle the moment *any* program passes
    // its own — so that soonest expiry is both the alert's moment and its key.
    // The colony genuinely stopped unless every program holding that expiry
    // was replaced first; one left alone idled the colony on schedule.
    const soonestExpiryMs = Math.min(...prevColony.extractors.map((e) => e.expiryTimeMs));
    const atSoonest = prevColony.extractors.filter((e) => e.expiryTimeMs === soonestExpiryMs);
    if (atSoonest.every((program) => replacedBefore(program, soonestExpiryMs))) {
      fires.push({
        eventId: 'planetaryExtractionDone',
        characterId,
        planetId: prevColony.planetId,
        expiryTimeMs: soonestExpiryMs,
      });
    }
  }
  return fires;
}
