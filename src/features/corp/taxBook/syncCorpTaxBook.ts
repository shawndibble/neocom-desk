/**
 * One officer visit's sync of the Corp Tax Book (issue #4062, D9): read what
 * ESI holds, upload it monotonically, record the gaps, then settle the
 * Statements the donations now cover. The server stores what it is sent and
 * does not detect settlement or gaps (#4061 hand-off), so both are decided here
 * with the pure engine (`engine/corpTaxBook/sync.ts`).
 *
 * The collaborators are passed in so the flow is testable without Firebase or
 * ESI; `defaultSyncDeps` wires the real ones.
 */
import {
  detectGaps,
  mergeGaps,
  placeObservedRows,
  openBalances,
  planSettlements,
  reconcileExtractions,
  resolveDonations,
  billableStoredRows,
  storedRowsWanted,
  unbilledMinerIds,
  type JournalDonation,
  type MoonNotification,
  type SyncExtraction,
} from '@/engine/corpTaxBook/sync';
import { matchDonation } from '@/engine/corpTaxBook/allocation';
import { noteUncounted, otherDivisions } from '@/engine/corpTaxBook/uncounted';
import {
  planSignInGroups,
  type GroupingEdit,
  type MergePrompt,
  type RegroupEdit,
} from '@/engine/corpTaxBook/grouping';
import type { Statement } from '@/engine/corpTaxBook/statements';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { FeederCoverage } from '@/engine/corpTaxBook/coverage';
import type { CorpCapabilities } from '@/engine/corpRoles';
import { db } from '@/db';
import type { CorporationMiningExtraction } from '@/esi/endpoints';
import {
  editBook,
  readDeclinedAutoGroup,
  readBookState,
  readStoredRows,
  uploadSync,
  verifyOfficer,
  type BookState,
  type OfficerVerdict,
  type SyncReceipt,
  type SyncUpload,
} from './bookClient';
import {
  loadDonations,
  loadOutgoingDonations,
  loadEsiExtractions,
  loadMoonNotifications,
  loadObserverFeed,
  type FeedFailure,
  type ObserverFeed,
} from './esiFeed';
import { reconcileFeederPayouts } from './feederClient';
import { chunk } from '@/lib/chunk';

/** The server accepts at most this many observer rows in one sync call. */
export const OBSERVED_PER_CALL = 2000;
/** And this many donations; the newest are sent first and the rest follow on the next visit. */
export const DONATIONS_PER_CALL = 500;
/** And this many extractions, and this many Statement ids to settle. */
export const EXTRACTIONS_PER_CALL = 200;
export const SETTLE_PER_CALL = 200;

export interface SyncDeps {
  now: () => number;
  verifyOfficer: (characterId: number, corporationId: number) => Promise<OfficerVerdict>;
  readBookState: (characterId: number, corporationId: number) => Promise<BookState | null>;
  loadObserverFeed: (
    characterId: number,
    corporationId: number
  ) => Promise<ObserverFeed | FeedFailure>;
  loadEsiExtractions: (
    characterId: number,
    corporationId: number
  ) => Promise<CorporationMiningExtraction[] | null>;
  loadMoonNotifications: (characterId: number) => Promise<MoonNotification[]>;
  loadDonations: (
    characterId: number,
    corporationId: number,
    divisions: readonly number[],
    options?: { whole?: boolean }
  ) => Promise<JournalDonation[] | null>;
  uploadSync: (characterId: number, upload: SyncUpload) => Promise<SyncReceipt>;
  /** Attaches the wallet's outgoing donations to the moon owner payouts recorded (no-op without moon owners). */
  reconcilePayouts?: (
    characterId: number,
    corporationId: number,
    divisions: readonly number[]
  ) => Promise<unknown>;
  settleStatements: (
    characterId: number,
    corporationId: number,
    statementIds: string[]
  ) => Promise<unknown>;
  /** The Characters on this app account with the corporation they were last seen in (D26). */
  loadAccountCharacters: () => Promise<{ characterId: number; corporationId: number }[]>;
  /** Characters an officer unlinked, read from the book so every officer's sync respects them. */
  declinedGrouping: (characterId: number, corporationId: number) => Promise<ReadonlySet<number>>;
  applyGrouping: (
    characterId: number,
    corporationId: number,
    edit: GroupingEdit | RegroupEdit
  ) => Promise<unknown>;
  /**
   * The book's stored observer rows and its moon owners' coverage: the mining it bills at moon
   * owners' refineries, which this Character's ESI read never holds. Read only when a donation is
   * held for review or a new one would be, so it can be matched against that mining too.
   */
  loadStoredRows?: (
    characterId: number,
    corporationId: number
  ) => Promise<{
    rows: readonly ObservedRow[];
    feeders: readonly FeederCoverage[];
  }>;
  /** Gives a stored Unmatched donation to a Miner (`assignPayment`, audited). */
  assignPayment: (
    characterId: number,
    corporationId: number,
    paymentId: string,
    minerId: string
  ) => Promise<unknown>;
}

export const defaultSyncDeps: SyncDeps = {
  now: Date.now,
  verifyOfficer,
  readBookState,
  loadObserverFeed,
  loadEsiExtractions,
  loadMoonNotifications,
  loadDonations,
  uploadSync,
  reconcilePayouts: async (characterId, corporationId, divisions) => {
    const outgoing = await loadOutgoingDonations(characterId, corporationId, divisions);
    if (outgoing.length > 0) await reconcileFeederPayouts(characterId, corporationId, outgoing);
  },
  settleStatements: (characterId, corporationId, statementIds) =>
    editBook(characterId, corporationId, { action: 'settleStatements', statementIds }),
  loadAccountCharacters: async () =>
    (await db.characters.toArray()).flatMap((c) =>
      c.corporationId === undefined
        ? []
        : [{ characterId: c.characterId, corporationId: c.corporationId }]
    ),
  declinedGrouping: readDeclinedAutoGroup,
  applyGrouping: (characterId, corporationId, edit) => editBook(characterId, corporationId, edit),
  assignPayment: (characterId, corporationId, paymentId, minerId) =>
    editBook(characterId, corporationId, { action: 'assignPayment', paymentId, minerId }),
  loadStoredRows: readStoredRows,
};

/** What the Character may read from ESI; the rest of the sync does without a source it cannot reach. */
export type SyncCapabilities = Pick<
  CorpCapabilities,
  'canReadMiningLedger' | 'canReadMoonExtractions' | 'canReadWallet'
>;

export type SyncOutcome =
  /** Nothing was uploaded. `reason` says why. */
  | {
      kind: 'skipped';
      reason:
        'missing-mining-scope' | 'no-book' | 'not-an-editor' | 'needs-reauth' | 'esi-unavailable';
    }
  | {
      kind: 'synced';
      observedRows: number;
      extractions: number;
      donationsAdded: number;
      /** Statement ids this visit settled. */
      settled: string[];
      /** The gaps now on record, earlier ones included. */
      gaps: ReturnType<typeof mergeGaps>;
      /** The corporation has no refinery this Character can read: donations synced, the ledger is empty. */
      noRefineries?: true;
      /** Sources this Character could not read this time (the rest still synced). */
      missing: MissingSource[];
      truncated: boolean;
      /** Characters of this account put into one Miner this visit (D26). */
      autoGrouped: number;
      /** Why grouping failed this visit, if it did (the sync itself still succeeded). */
      autoGroupError?: string;
      /** Merges an officer is asked to decide: too large for one write, or two groups claim one character. */
      groupPrompts?: MergePrompt[];
      /** Account characters an officer removed or a character declined: never re-added. */
      groupFlagged?: number[];
      /** Why re-matching stored Unmatched payments failed this visit, if it did (the sync itself still succeeded). */
      reassignError?: string;
    };

/**
 * A source this Character could not read this time; the rest still synced. `ore`: no
 * Station_Manager role (or no extraction scope), so neither the Extractions nor their ore were read.
 */
export type MissingSource = 'extractions' | 'donations' | 'ore';

const paymentId = (d: JournalDonation) => `j${d.division}_${d.refId}`;

export async function syncCorpTaxBook(
  args: { characterId: number; corporationId: number; capabilities: SyncCapabilities },
  deps: SyncDeps = defaultSyncDeps
): Promise<SyncOutcome> {
  const { characterId, corporationId, capabilities } = args;
  // Without the scope the observer read is a guaranteed 403; ask for it first (`useMiningLedgerAccess`).
  if (!capabilities.canReadMiningLedger) return { kind: 'skipped', reason: 'missing-mining-scope' };

  const verdict = await deps.verifyOfficer(characterId, corporationId);
  if (!verdict.bookActive) return { kind: 'skipped', reason: 'no-book' };
  if (!verdict.canEdit) return { kind: 'skipped', reason: 'not-an-editor' };

  const before = await deps.readBookState(characterId, corporationId);
  if (!before) return { kind: 'skipped', reason: 'no-book' };

  const missing: MissingSource[] = [];
  const canExtract = capabilities.canReadMoonExtractions && verdict.isStationManager;
  const [feedRead, esiExtractions, notifications, donations, elsewhere] = await Promise.all([
    deps.loadObserverFeed(characterId, corporationId),
    canExtract ? deps.loadEsiExtractions(characterId, corporationId) : Promise.resolve(null),
    canExtract
      ? deps.loadMoonNotifications(characterId).catch(() => [] as MoonNotification[])
      : Promise.resolve([] as MoonNotification[]),
    capabilities.canReadWallet
      ? deps.loadDonations(characterId, corporationId, before.book.divisions).catch(() => null)
      : Promise.resolve(null),
    // #6207: the divisions the book does not read, only to note what looks like tax paid there.
    capabilities.canReadWallet
      ? deps
          .loadDonations(characterId, corporationId, otherDivisions(before.book.divisions), {
            whole: true,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  if (feedRead === 'needs-reauth') return { kind: 'skipped', reason: 'needs-reauth' };
  // Recording a sync whose ledger never arrived would blame the gap on the officers.
  if (feedRead === 'unavailable') return { kind: 'skipped', reason: 'esi-unavailable' };
  // Donations still sync, but the outcome says the ledger had nothing to read, so the page never calls it "Synced".
  const noRefineries = feedRead === 'no-refineries';
  const feed: ObserverFeed = noRefineries
    ? { rows: [], structureIds: [], oldestEsiDate: {}, truncated: false, systemIds: {} }
    : feedRead;
  if (canExtract && esiExtractions === null) missing.push('extractions');
  // A corp with no refinery of its own (only moon owners) has no chunk of its own to read.
  if (!canExtract && !noRefineries) missing.push('ore');
  if (!capabilities.canReadWallet || donations === null) missing.push('donations');

  const now = deps.now();
  const gaps = mergeGaps(
    before.book.lastSync?.gaps ?? [],
    detectGaps({
      lastSyncAt: before.book.lastSync?.at ?? null,
      now,
      startDate: before.book.startDate,
      structureIds: feed.structureIds,
      oldestEsiDate: feed.oldestEsiDate,
    })
  );

  const extractions: SyncExtraction[] = canExtract
    ? reconcileExtractions(esiExtractions ?? [], notifications, before.extractions)
    : [];

  const stored = new Set(before.payments.map((p) => p.id));
  const fresh = (donations ?? [])
    .filter((d) => !stored.has(paymentId(d)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DONATIONS_PER_CALL);
  // The rows donations are matched against: this read's, and the moon owners' mining the book
  // bills, which only the stored rows hold.
  const rows = [
    ...feed.rows,
    ...(await billedStoredRows(deps, characterId, corporationId, before, feed.rows, fresh)),
  ] as ObservedRow[];
  const known = new Set<number>([
    ...rows.map((r) => r.characterId),
    ...before.miners.flatMap((m) => m.characterIds),
    ...before.payments.filter((p) => p.minerId !== undefined).map((p) => p.characterId),
  ]);
  const matching = {
    miners: before.miners,
    statements: before.statements as Statement[],
    knownCharacterIds: known,
    openBalance: openBalanceOf(before),
    unbilled: unbilledOf(before, rows),
  };
  const resolved = resolveDonations(fresh, matching);
  const uncounted = elsewhere === null ? undefined : noteUncounted(elsewhere, matching, resolved);

  // The first call carries everything but the overflow of observer rows, so a
  // later failure loses only ledger rows (each call also records the visit).
  // The server caps extractions per call, so they split too.
  const placed = placeObservedRows(
    feed.rows as ObservedRow[],
    canExtract ? extractions : before.extractions,
    feed.systemIds
  );
  const batches = chunk(placed, OBSERVED_PER_CALL);
  const extraCalls = chunk(extractions, EXTRACTIONS_PER_CALL);
  const first = { observed: batches.shift() ?? [], extractions: extraCalls.shift() ?? [] };
  // Verifying again right before writing renews the 10-minute role cache the
  // upload relies on, which the slow ESI reads above may have outlived.
  await deps.verifyOfficer(characterId, corporationId);
  const receipt = await deps.uploadSync(characterId, {
    corporationId,
    ...first,
    donations: resolved,
    gaps,
    ...(uncounted ? { uncounted } : {}),
    // Members' "not credited" notes wait on a sync that read the wallet, not on any sync.
    donationsRead: capabilities.canReadWallet && donations !== null,
  });
  const { donationsAdded } = receipt;
  for (const observed of batches) {
    await deps.uploadSync(characterId, { corporationId, observed, gaps });
  }
  for (const rest of extraCalls) {
    await deps.uploadSync(characterId, { corporationId, extractions: rest, gaps });
  }

  // What the wallet sent a moon owner is its own books: a failure here is not the sync's.
  if (capabilities.canReadWallet && donations !== null) {
    await deps
      .reconcilePayouts?.(characterId, corporationId, before.book.divisions)
      .catch(() => undefined);
  }

  // D26: this account's own Characters in the corporation share one Miner, so one payment covers them.
  const {
    grouped: autoGrouped,
    error: autoGroupError,
    prompts: groupPrompts,
    flagged: groupFlagged,
  } = await autoGroup(deps, characterId, corporationId, before.miners, recordCounts(before));

  // A donation stored Unmatched stays so forever unless re-matched: its sender may have joined a
  // Miner (or mined here) since. Assign the ones that match now; the officer's queue keeps the rest.
  const { assigned: reassigned, error: reassignError } = await reassignUnmatched(
    deps,
    characterId,
    corporationId,
    {
      before,
      known,
      rows,
      regrouped: autoGrouped > 0,
    }
  );

  // The donations just stored may settle Statements; read the book back to allocate against all of it.
  const after =
    donationsAdded > 0 || reassigned > 0
      ? await deps.readBookState(characterId, corporationId)
      : before;
  const toSettle = after
    ? planSettlements({
        statements: after.statements as Statement[],
        payments: after.payments,
        dismissals: after.dismissals,
        miners: after.miners,
        alreadyPaid: after.paidStatementIds,
        extractions: after.extractions,
        ...(after.writeOffs ? { writeOffs: after.writeOffs } : {}),
        startDate: after.book.startDate,
        ...(after.disputes ? { disputes: after.disputes } : {}),
        now: new Date(deps.now()).toISOString(),
      })
    : [];
  for (const ids of chunk(toSettle, SETTLE_PER_CALL)) {
    await deps.settleStatements(characterId, corporationId, ids);
  }

  return {
    kind: 'synced',
    observedRows: feed.rows.length,
    extractions: extractions.length,
    donationsAdded,
    settled: toSettle,
    gaps,
    missing,
    truncated: feed.truncated,
    ...(noRefineries ? { noRefineries: true as const } : {}),
    autoGrouped,
    ...(autoGroupError ? { autoGroupError } : {}),
    ...(groupPrompts.length > 0 ? { groupPrompts } : {}),
    ...(groupFlagged.length > 0 ? { groupFlagged } : {}),
    ...(reassignError ? { reassignError } : {}),
  };
}

/**
 * The stored rows the book bills that a held or would-be-held donation is matched against
 * (`storedRowsWanted`): its moon owners' mining, which this Character's ESI read never holds.
 * None when nothing is held and every new donation already matches; a failed read is none too
 * (the hold stays for the next sync).
 */
async function billedStoredRows(
  deps: SyncDeps,
  characterId: number,
  corporationId: number,
  book: BookState,
  feedRows: readonly ObservedRow[],
  fresh: readonly JournalDonation[]
): Promise<ObservedRow[]> {
  if (!deps.loadStoredRows) return [];
  const held = book.payments.filter(
    (p) =>
      p.minerId === undefined &&
      p.reviewReason === 'no-open-balance' &&
      !(p.notTaxAmount && p.notTaxAmount > 0)
  );
  const known = new Set<number>([
    ...feedRows.map((r) => r.characterId),
    ...book.miners.flatMap((m) => m.characterIds),
    ...book.payments.filter((p) => p.minerId !== undefined).map((p) => p.characterId),
  ]);
  const feedOnly = {
    miners: book.miners,
    statements: book.statements as Statement[],
    knownCharacterIds: known,
    openBalance: openBalanceOf(book),
    unbilled: unbilledOf(book, feedRows),
  };
  const senders = [
    ...new Set(
      fresh
        .filter((d) => {
          const match = matchDonation({ characterId: d.characterId, reason: d.reason }, feedOnly);
          return match.kind !== 'miner' && match.kind !== 'statement';
        })
        .map((d) => d.characterId)
    ),
  ];
  const wanted = storedRowsWanted({
    held,
    senders,
    miners: book.miners,
    statements: book.statements as Statement[],
    startDate: book.book.startDate,
  });
  if (wanted.size === 0) return [];
  try {
    const stored = await deps.loadStoredRows(characterId, corporationId);
    return billableStoredRows(stored.rows, wanted, corporationId, stored.feeders);
  } catch {
    return [];
  }
}

/** The Miners with ore this read found that no Statement covers yet, for `matchDonation` (#6207). */
function unbilledOf(book: BookState, rows: readonly ObservedRow[]): Set<string> {
  return unbilledMinerIds(rows, {
    miners: book.miners,
    statements: book.statements as Statement[],
    startDate: book.book.startDate,
  });
}

/** What each Miner owes on the book's issued Statements, for `matchDonation` (#6207). */
function openBalanceOf(book: BookState): Map<string, number> {
  return openBalances({
    statements: book.statements as Statement[],
    payments: book.payments,
    dismissals: book.dismissals,
    miners: book.miners,
    extractions: book.extractions,
    ...(book.writeOffs ? { writeOffs: book.writeOffs } : {}),
    startDate: book.book.startDate,
  });
}

/** Re-runs `matchDonation` for stored Unmatched payments and assigns those that now match. A failure is not the sync's, so it is returned for the page to show. */
async function reassignUnmatched(
  deps: SyncDeps,
  characterId: number,
  corporationId: number,
  args: {
    before: BookState;
    known: ReadonlySet<number>;
    rows: readonly ObservedRow[];
    regrouped: boolean;
  }
): Promise<{ assigned: number; error?: string }> {
  const open = args.before.payments
    .filter((p) => p.minerId === undefined && !(p.notTaxAmount && p.notTaxAmount > 0))
    .sort((a, b) => a.at.localeCompare(b.at));
  if (open.length === 0) return { assigned: 0 };
  let assigned = 0;
  try {
    const book = args.regrouped
      ? ((await deps.readBookState(characterId, corporationId)) ?? args.before)
      : args.before;
    const known = new Set([...args.known, ...book.miners.flatMap((m) => m.characterIds)]);
    // A sender the book knows credits their Miner, owing or not (#6300). That includes one held
    // for review under #6207: the next sync clears it.
    const balance = openBalanceOf(book);
    const unbilled = unbilledOf(book, args.rows);
    for (const p of open) {
      const match = matchDonation(
        { characterId: p.characterId, reason: (p as { reason?: string }).reason },
        {
          miners: book.miners,
          statements: book.statements as Statement[],
          knownCharacterIds: known,
          openBalance: balance,
          unbilled,
        }
      );
      if (match.kind !== 'miner' && match.kind !== 'statement') continue;
      await deps.assignPayment(characterId, corporationId, p.id, match.minerId);
      balance.set(match.minerId, (balance.get(match.minerId) ?? 0) - p.amount);
      assigned += 1;
    }
    return { assigned };
  } catch (e) {
    return { assigned, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Groups the app account's Characters (proven by this very login) that are in the corporation
 * (`planSignInGroups`): free ones into one Miner, Miners they touch merged by regroup while the
 * records moved fit one write, else a prompt for an officer. A failure here must not fail the sync
 * that already uploaded, so it is reported in the outcome and the next visit tries again.
 */
async function autoGroup(
  deps: SyncDeps,
  characterId: number,
  corporationId: number,
  miners: BookState['miners'],
  records: ReadonlyMap<string, number>
): Promise<{ grouped: number; error?: string; prompts: MergePrompt[]; flagged: number[] }> {
  try {
    const { edits, prompts, flagged } = planSignInGroups({
      corporationId,
      proven: await deps.loadAccountCharacters(),
      miners,
      declined: await deps.declinedGrouping(characterId, corporationId),
      preferredMain: characterId,
      recordCountByMiner: records,
    });
    for (const edit of edits) await deps.applyGrouping(characterId, corporationId, edit);
    const grouped = edits.reduce(
      (n, e) => n + (e.action === 'unlink' ? 0 : e.characterIds.length),
      0
    );
    return { grouped, prompts, flagged };
  } catch (e) {
    return {
      grouped: 0,
      error: e instanceof Error ? e.message : String(e),
      prompts: [],
      flagged: [],
    };
  }
}

/** What a merge would move per Miner: its Statements and payments (the records the re-key rewrites). */
function recordCounts(book: BookState): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const s of book.statements as { minerId?: string }[]) bump(s.minerId);
  for (const p of book.payments) bump(p.minerId);
  for (const d of book.dismissals as { minerId?: string }[]) bump(d.minerId);
  for (const w of book.writeOffs ?? []) bump((w as { minerId?: string }).minerId);
  return counts;
}
