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
  planSettlements,
  reconcileExtractions,
  resolveDonations,
  type JournalDonation,
  type MoonNotification,
  type SyncExtraction,
} from '@/engine/corpTaxBook/sync';
import { matchDonation } from '@/engine/corpTaxBook/allocation';
import { planAutoGroups, type GroupingEdit } from '@/engine/corpTaxBook/grouping';
import type { Statement } from '@/engine/corpTaxBook/statements';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { CorpCapabilities } from '@/engine/corpRoles';
import { db } from '@/db';
import type { CorporationMiningExtraction } from '@/esi/endpoints';
import {
  editBook,
  readDeclinedAutoGroup,
  readBookState,
  uploadSync,
  verifyOfficer,
  type BookState,
  type OfficerVerdict,
  type SyncReceipt,
  type SyncUpload,
} from './bookClient';
import {
  loadDonations,
  loadEsiExtractions,
  loadMoonNotifications,
  loadObserverFeed,
  type FeedFailure,
  type ObserverFeed,
} from './esiFeed';

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
    divisions: readonly number[]
  ) => Promise<JournalDonation[]>;
  uploadSync: (characterId: number, upload: SyncUpload) => Promise<SyncReceipt>;
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
    edit: GroupingEdit
  ) => Promise<unknown>;
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
      /** Why re-matching stored Unmatched payments failed this visit, if it did (the sync itself still succeeded). */
      reassignError?: string;
    };

/** A source this Character could not read this time; the rest still synced. */
export type MissingSource = 'extractions' | 'donations';

const paymentId = (d: JournalDonation) => `j${d.division}_${d.refId}`;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
  const [feedRead, esiExtractions, notifications, donations] = await Promise.all([
    deps.loadObserverFeed(characterId, corporationId),
    canExtract ? deps.loadEsiExtractions(characterId, corporationId) : Promise.resolve(null),
    canExtract
      ? deps.loadMoonNotifications(characterId).catch(() => [] as MoonNotification[])
      : Promise.resolve([] as MoonNotification[]),
    capabilities.canReadWallet
      ? deps.loadDonations(characterId, corporationId, before.book.divisions).catch(() => null)
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

  const known = new Set<number>([
    ...feed.rows.map((r) => r.characterId),
    ...before.miners.flatMap((m) => m.characterIds),
    ...before.payments.filter((p) => p.minerId !== undefined).map((p) => p.characterId),
  ]);
  const stored = new Set(before.payments.map((p) => p.id));
  const fresh = (donations ?? [])
    .filter((d) => !stored.has(paymentId(d)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DONATIONS_PER_CALL);
  const resolved = resolveDonations(fresh, {
    miners: before.miners,
    statements: before.statements as Statement[],
    knownCharacterIds: known,
  });

  // The first call carries everything but the overflow of observer rows, so a
  // later failure loses only ledger rows (each call also records the visit).
  // The server caps extractions per call, so they split too.
  const placed = placeObservedRows(
    feed.rows as ObservedRow[],
    canExtract ? extractions : before.extractions,
    feed.systemIds
  );
  const batches = chunks(placed, OBSERVED_PER_CALL);
  const extraCalls = chunks(extractions, EXTRACTIONS_PER_CALL);
  const first = { observed: batches.shift() ?? [], extractions: extraCalls.shift() ?? [] };
  // Verifying again right before writing renews the 10-minute role cache the
  // upload relies on, which the slow ESI reads above may have outlived.
  await deps.verifyOfficer(characterId, corporationId);
  const receipt = await deps.uploadSync(characterId, {
    corporationId,
    ...first,
    donations: resolved,
    gaps,
  });
  const { donationsAdded } = receipt;
  for (const observed of batches) {
    await deps.uploadSync(characterId, { corporationId, observed, gaps });
  }
  for (const rest of extraCalls) {
    await deps.uploadSync(characterId, { corporationId, extractions: rest, gaps });
  }

  // D26: this account's own Characters in the corporation share one Miner, so one payment covers them.
  const { grouped: autoGrouped, error: autoGroupError } = await autoGroup(
    deps,
    characterId,
    corporationId,
    before.miners
  );

  // A donation stored Unmatched stays so forever unless re-matched: its sender may have joined a
  // Miner (or mined here) since. Assign the ones that match now; the officer's queue keeps the rest.
  const { assigned: reassigned, error: reassignError } = await reassignUnmatched(
    deps,
    characterId,
    corporationId,
    {
      before,
      known,
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
      })
    : [];
  for (const ids of chunks(toSettle, SETTLE_PER_CALL)) {
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
    ...(reassignError ? { reassignError } : {}),
  };
}

/** Re-runs `matchDonation` for stored Unmatched payments and assigns those that now match. A failure is not the sync's, so it is returned for the page to show. */
async function reassignUnmatched(
  deps: SyncDeps,
  characterId: number,
  corporationId: number,
  args: { before: BookState; known: ReadonlySet<number>; regrouped: boolean }
): Promise<{ assigned: number; error?: string }> {
  const unmatched = args.before.payments.filter(
    (p) => p.minerId === undefined && !(p.notTaxAmount && p.notTaxAmount > 0)
  );
  if (unmatched.length === 0) return { assigned: 0 };
  let assigned = 0;
  try {
    const book = args.regrouped
      ? ((await deps.readBookState(characterId, corporationId)) ?? args.before)
      : args.before;
    const known = new Set([...args.known, ...book.miners.flatMap((m) => m.characterIds)]);
    for (const p of unmatched) {
      const match = matchDonation(
        { characterId: p.characterId, reason: (p as { reason?: string }).reason },
        {
          miners: book.miners,
          statements: book.statements as Statement[],
          knownCharacterIds: known,
        }
      );
      if (match.kind === 'unmatched') continue;
      await deps.assignPayment(characterId, corporationId, p.id, match.minerId);
      assigned += 1;
    }
    return { assigned };
  } catch (e) {
    return { assigned, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Groups the app account's Characters that are in the corporation and not in a
 * Miner yet. A failure here must not fail the sync that already uploaded, so
 * it is reported in the outcome (the page shows it) and the next visit tries again.
 */
async function autoGroup(
  deps: SyncDeps,
  characterId: number,
  corporationId: number,
  miners: BookState['miners']
): Promise<{ grouped: number; error?: string }> {
  try {
    const edits = planAutoGroups({
      corporationId,
      accountCharacters: await deps.loadAccountCharacters(),
      miners,
      declined: await deps.declinedGrouping(characterId, corporationId),
      preferredMain: characterId,
    });
    for (const edit of edits) await deps.applyGrouping(characterId, corporationId, edit);
    const grouped = edits.reduce(
      (n, e) => n + (e.action === 'setMiner' ? e.characterIds.length : 0),
      0
    );
    return { grouped };
  } catch (e) {
    return { grouped: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
