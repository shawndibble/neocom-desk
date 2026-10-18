/** Engine-native mirror of ESI's `Contract.status` (ARCHITECTURE.md: callers adapt ESI shapes at the boundary). */
export type ContractStatus =
  | 'outstanding'
  | 'in_progress'
  | 'finished_issuer'
  | 'finished_contractor'
  | 'finished'
  | 'cancelled'
  | 'rejected'
  | 'failed'
  | 'deleted'
  | 'reversed';

export interface ContractEntrySnapshot {
  contractId: number;
  status: ContractStatus;
  /**
   * Added for issue #1091's completed/failed events, which — unlike
   * `contractAccepted` — must stay silent for a contract the character is
   * only the `assignee` of (an offer merely made *to* them, not one they
   * issued or accepted): `getCharacterContracts` also returns those, and
   * without this filter a stranger's contract to someone else being
   * withdrawn would announce itself. `diffContractCompleted`/
   * `diffContractFailed` check these; `diffContractAccepted` deliberately
   * does not (issue #1091's scope: that event is unchanged).
   */
  issuerId: number;
  acceptorId: number;
  /**
   * The accepted courier's deliver-by instant (`courierDeliveryDeadlineMs`,
   * issue #1713), absent for any contract that has none (not a courier, not
   * in progress, or no derivable window). Optional so a baseline persisted
   * before this field existed still validates (`ColonyExtractorSnapshot.installTimeMs`'s
   * precedent) — `diffCourierDeliveryDue` reads a missing value as "no
   * deadline", and the next poll fills it in.
   */
  deliveryDeadlineMs?: number;
  /**
   * The Character's `courierDeliveryDueLeadHours` threshold, in ms, as it
   * stood when this poll ran — baked in per entry for the same reason
   * `SkillQueueEntrySnapshot.endingLeadMs` is (`DomainDiff` is synchronous
   * and cannot read a preference). Only set alongside `deliveryDeadlineMs`.
   */
  dueLeadMs?: number;
  /**
   * `date_expired`, epoch ms, set only on an `outstanding` contract the
   * Character themselves issued (`contractExpiring`, issue #3797) — a contract
   * merely offered *to* them is not theirs to relist. Optional so a baseline
   * persisted before this field existed still validates.
   */
  expiresMs?: number;
  /** The Character's `contractExpiringLeadHours` in ms, baked in beside `expiresMs` for `dueLeadMs`'s reason. */
  expiringLeadMs?: number;
  /**
   * ESI's `date_accepted` / `date_completed`, epoch ms — what dates a
   * `contractAccepted` / `contractCompleted` feed row, rather than the poll
   * that happened to notice it. Optional: absent until ESI sets them, and a
   * baseline persisted before they existed must still validate.
   */
  dateAcceptedMs?: number;
  dateCompletedMs?: number;
}

export interface ContractSnapshot {
  entries: readonly ContractEntrySnapshot[];
  nowMs: number;
}

export interface ContractNotificationFire {
  eventId:
    | 'contractAccepted'
    | 'contractCompleted'
    | 'contractFailed'
    | 'courierDeliveryDue'
    | 'contractExpiring';
  characterId: number;
  contractId: number;
  /** `courierDeliveryDue` (issue #1713) / `contractExpiring` (issue #3797): the deliver-by / expiry instant the warning is about. */
  deadlineMs?: number;
  /** `courierDeliveryDue` / `contractExpiring`: the lead time, in ms, that it crossed. */
  thresholdMs?: number;
  /**
   * `contractAccepted` / `contractCompleted` only: when ESI says that
   * happened (`date_accepted` / `date_completed`), when it said.
   */
  occurredMs?: number;
  /**
   * `contractAccepted` / `contractCompleted` / `contractFailed` only: the net
   * ISK the wallet moved for this contract, when the journal lines it caused
   * were seen in the same poll (`engine/walletCause.ts`). Display only — not
   * part of the Occurrence Key.
   */
  walletChangeIsk?: number;
}

/**
 * Fires per contract whose status is newly `in_progress` (issue #174) — ESI
 * has no `accepted` status literal; `in_progress` is what a contract becomes
 * once accepted. Edge-triggered on the transition, keyed by contract id: a
 * contract missing from `prev.entries` (first time this poll has seen it) is
 * treated as not-previously-in-progress, so a contract discovered already
 * in progress still fires once — same discovered-already-true shape as
 * `diffPlanetaryExtractionDone`. `getCharacterContracts` returns every page
 * (not windowed like mail/calendar), so no high-water-mark guard is needed
 * here.
 */
export function diffContractAccepted(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.contractId, entry]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.status !== 'in_progress') continue;
    const before = prevById.get(entry.contractId);
    if (before?.status === 'in_progress') continue;
    // ESI keeps an accepted courier `outstanding`, which baselines saved before
    // `withAcceptedCourierInProgress` recorded as is: an outstanding entry that already
    // had an acceptor was accepted earlier and merely changed label.
    if (before?.status === 'outstanding' && before.acceptorId !== 0) continue;
    fires.push({
      eventId: 'contractAccepted',
      characterId,
      contractId: entry.contractId,
      ...(entry.dateAcceptedMs === undefined ? {} : { occurredMs: entry.dateAcceptedMs }),
    });
  }
  return fires;
}

/**
 * Fires once an accepted courier's deliver-by deadline falls within the
 * Character's configured lead time (issue #1713), so a hauler can act before
 * the collateral is forfeited — `contractFailed` only ever arrives after.
 * Judged against `deliveryDeadlineMs` (`courierDeliveryDeadlineMs`), never
 * `date_expired`. Only contracts the Character themselves accepted qualify:
 * `getCharacterContracts` also returns contracts merely offered to them.
 *
 * Window-crossing, on `diffSkillQueueEnding`'s precedent: "inside the window
 * now" uses this poll's `dueLeadMs`, "was already inside" uses the
 * *previous* entry's own, so raising or lowering the lead time takes effect
 * on the very next poll in both directions. A deadline already passed fires
 * nothing — that is `contractFailed`'s to report. `prev === undefined` fires
 * nothing, this module's rule throughout.
 */
export function diffCourierDeliveryDue(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.contractId, entry]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    const { deliveryDeadlineMs, dueLeadMs } = entry;
    if (entry.status !== 'in_progress' || entry.acceptorId !== characterId) continue;
    if (deliveryDeadlineMs === undefined || dueLeadMs === undefined) continue;
    const remainingNow = deliveryDeadlineMs - next.nowMs;
    if (remainingNow <= 0 || remainingNow > dueLeadMs) continue;
    const before = prevById.get(entry.contractId);
    if (
      before !== undefined &&
      before.status === 'in_progress' &&
      before.deliveryDeadlineMs === deliveryDeadlineMs &&
      before.dueLeadMs !== undefined &&
      deliveryDeadlineMs - prev.nowMs <= before.dueLeadMs
    ) {
      continue;
    }
    fires.push({
      eventId: 'courierDeliveryDue',
      characterId,
      contractId: entry.contractId,
      deadlineMs: deliveryDeadlineMs,
      thresholdMs: dueLeadMs,
    });
  }
  return fires;
}

/**
 * Fires once an `outstanding` contract the Character issued has its
 * `date_expired` inside their configured lead time (issue #3797), so they can
 * relist before it lapses unaccepted. Accepted, deleted and finished
 * contracts are not `outstanding`, so they never fire; neither does one merely
 * assigned to the Character. A courier already in progress is
 * `courierDeliveryDue`'s, which judges the delivery deadline instead.
 *
 * Window-crossing exactly as `diffCourierDeliveryDue`: this poll's
 * `expiringLeadMs` decides "inside now", the previous entry's own decides
 * "was already inside", so a changed lead time takes effect on the next poll.
 */
export function diffContractExpiring(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.contractId, entry]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    const { expiresMs, expiringLeadMs } = entry;
    if (entry.status !== 'outstanding' || entry.issuerId !== characterId) continue;
    if (expiresMs === undefined || expiringLeadMs === undefined) continue;
    const remainingNow = expiresMs - next.nowMs;
    if (remainingNow <= 0 || remainingNow > expiringLeadMs) continue;
    const before = prevById.get(entry.contractId);
    if (
      before !== undefined &&
      before.status === 'outstanding' &&
      before.expiresMs === expiresMs &&
      before.expiringLeadMs !== undefined &&
      expiresMs - prev.nowMs <= before.expiringLeadMs
    ) {
      continue;
    }
    fires.push({
      eventId: 'contractExpiring',
      characterId,
      contractId: entry.contractId,
      deadlineMs: expiresMs,
      thresholdMs: expiringLeadMs,
    });
  }
  return fires;
}

/** `outstanding` and `in_progress` are the two statuses a contract's terminal diffs treat as "still live" — see `wasLiveContractStatus`. */
const COMPLETED_CONTRACT_STATUSES: ReadonlySet<ContractStatus> = new Set([
  'finished_issuer',
  'finished_contractor',
  'finished',
]);

/**
 * Whether a contract's previous status counts as "outstanding or in
 * progress" for issue #1091's terminal-transition guard: `diffContractAccepted`
 * only ever moves a contract's status *forward* from one of these two, so
 * "was live" is the same condition either terminal diff needs before it
 * announces a transition — a contract discovered already at a terminal
 * status (`prevStatus` `undefined`) is never live, matching the
 * discovered-already-true exclusion the ticket calls for.
 */
function wasLiveContractStatus(prevStatus: ContractStatus | undefined): boolean {
  return prevStatus === 'outstanding' || prevStatus === 'in_progress';
}

/** Whether `characterId` is the issuer or the acceptor — never the mere assignee — of this snapshot entry (issue #1091). */
function isPartyToContract(entry: ContractEntrySnapshot, characterId: number): boolean {
  return entry.issuerId === characterId || entry.acceptorId === characterId;
}

/**
 * Shared shape behind `diffContractCompleted`/`diffContractFailed` (issue
 * #1091) — the two differ only in which status counts as the transition and
 * which event id they report, so factored out rather than duplicated:
 * requires the previous poll to have actually recorded this contract as
 * outstanding or in progress (`wasLiveContractStatus`) — without that, the
 * first poll after this field's own baseline reset (or a genuine ESI window
 * shift) would backfill an announcement for every contract that quietly
 * closed weeks ago — and requires `characterId` to be the issuer or acceptor
 * (`isPartyToContract`) — the endpoint also returns contracts merely offered
 * to the character, and without this a stranger's contract resolving for
 * someone else would announce itself.
 */
function diffContractTerminalTransition(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot,
  eventId: 'contractCompleted' | 'contractFailed',
  matchesStatus: (status: ContractStatus) => boolean,
  occurredAt: (entry: ContractEntrySnapshot) => number | undefined = () => undefined
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevStatusById = new Map(prev.entries.map((entry) => [entry.contractId, entry.status]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    if (!matchesStatus(entry.status)) continue;
    if (!wasLiveContractStatus(prevStatusById.get(entry.contractId))) continue;
    if (!isPartyToContract(entry, characterId)) continue;
    const occurredMs = occurredAt(entry);
    fires.push({
      eventId,
      characterId,
      contractId: entry.contractId,
      ...(occurredMs === undefined ? {} : { occurredMs }),
    });
  }
  return fires;
}

/**
 * Fires per contract whose status is newly one of the three completed forms
 * (issue #1091) — a courier's collateral released, or an item exchange's sale
 * gone through. Deliberately silent for `rejected`/`cancelled`/`deleted`/
 * `reversed`: those are withdrawn-offer noise, not something that ran to
 * completion. See `diffContractTerminalTransition` for the shared guards.
 */
export function diffContractCompleted(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  return diffContractTerminalTransition(
    characterId,
    prev,
    next,
    'contractCompleted',
    (status) => COMPLETED_CONTRACT_STATUSES.has(status),
    (entry) => entry.dateCompletedMs
  );
}

/**
 * Fires per contract whose status is newly `failed` — and only `failed`
 * (issue #1091): a courier that blew its deadline, collateral forfeited. See
 * `diffContractTerminalTransition` for the shared guards.
 */
export function diffContractFailed(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  return diffContractTerminalTransition(
    characterId,
    prev,
    next,
    'contractFailed',
    (status) => status === 'failed'
  );
}
