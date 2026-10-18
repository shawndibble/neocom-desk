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
  planSettlements,
  reconcileExtractions,
  resolveDonations,
  type JournalDonation,
  type MoonNotification,
  type SyncExtraction,
} from '@/engine/corpTaxBook/sync';
import type { Statement } from '@/engine/corpTaxBook/statements';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { CorpCapabilities } from '@/engine/corpRoles';
import type { CorporationMiningExtraction } from '@/esi/endpoints';
import {
  editBook,
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
      /** Sources this Character could not read this time (the rest still synced). */
      missing: ('extractions' | 'donations' | 'moon-notifications')[];
      truncated: boolean;
    };

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

  const missing: ('extractions' | 'donations' | 'moon-notifications')[] = [];
  const canExtract = capabilities.canReadMoonExtractions && verdict.isStationManager;
  const [feed, esiExtractions, notifications, donations] = await Promise.all([
    deps.loadObserverFeed(characterId, corporationId),
    canExtract ? deps.loadEsiExtractions(characterId, corporationId) : Promise.resolve(null),
    canExtract
      ? deps.loadMoonNotifications(characterId).catch(() => [] as MoonNotification[])
      : Promise.resolve([] as MoonNotification[]),
    capabilities.canReadWallet
      ? deps.loadDonations(characterId, corporationId, before.book.divisions).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (feed === 'needs-reauth') return { kind: 'skipped', reason: 'needs-reauth' };
  // Recording a sync whose ledger never arrived would blame the gap on the officers.
  if (feed === 'unavailable') return { kind: 'skipped', reason: 'esi-unavailable' };
  if (canExtract && esiExtractions === null) missing.push('extractions');
  if (!capabilities.canReadWallet || donations === null) missing.push('donations');
  if (canExtract && notifications.length === 0) missing.push('moon-notifications');

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

  // Observer rows past the per-call cap go first, in their own calls; the last
  // call carries everything else and records the visit.
  const batches = chunks(feed.rows as ObservedRow[], OBSERVED_PER_CALL);
  const tail = batches.pop() ?? [];
  for (const observed of batches) {
    await deps.uploadSync(characterId, { corporationId, observed, gaps });
  }
  const receipt = await deps.uploadSync(characterId, {
    corporationId,
    observed: tail,
    extractions,
    donations: resolved,
    gaps,
  });
  const { donationsAdded } = receipt;

  // The donations just stored may settle Statements; read the book back to allocate against all of it.
  const after = donationsAdded > 0 ? await deps.readBookState(characterId, corporationId) : before;
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
  if (toSettle.length > 0) await deps.settleStatements(characterId, corporationId, toSettle);

  return {
    kind: 'synced',
    observedRows: feed.rows.length,
    extractions: extractions.length,
    donationsAdded,
    settled: toSettle,
    gaps,
    missing,
    truncated: feed.truncated,
  };
}
