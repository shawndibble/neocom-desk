import {
  detectGaps,
  mergeGaps,
  placeObservedRows,
  reconcileExtractions,
  donationMatchBook,
  billableStoredRows,
  minedSinceStart,
  storedRowsWanted,
  type JournalDonation,
  type MoonNotification,
  type SyncExtraction,
} from '@/engine/corpTaxBook/sync';
import {
  donationOwner,
  rematchUnmatched,
  type UnmatchedCandidate,
} from '../../../../functions/src/corpTaxBookDonationMatch';
import { utcDay } from '@/engine/localDay';
import { noteUncountedDonations, otherDivisions } from '@/engine/corpTaxBook/uncounted';
import {
  planSignInGroups,
  type GroupingEdit,
  type MergePrompt,
  type RegroupEdit,
} from '@/engine/corpTaxBook/grouping';
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

export const OBSERVED_PER_CALL = 2000;
export const DONATIONS_PER_CALL = 500;
export const EXTRACTIONS_PER_CALL = 200;

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
  reconcilePayouts?: (
    characterId: number,
    corporationId: number,
    divisions: readonly number[]
  ) => Promise<unknown>;
  loadAccountCharacters: () => Promise<{ characterId: number; corporationId: number }[]>;
  declinedGrouping: (characterId: number, corporationId: number) => Promise<ReadonlySet<number>>;
  applyGrouping: (
    characterId: number,
    corporationId: number,
    edit: GroupingEdit | RegroupEdit
  ) => Promise<unknown>;
  loadStoredRows?: (
    characterId: number,
    corporationId: number
  ) => Promise<{
    rows: readonly ObservedRow[];
    feeders: readonly FeederCoverage[];
  }>;
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

export type SyncCapabilities = Pick<
  CorpCapabilities,
  'canReadMiningLedger' | 'canReadMoonExtractions' | 'canReadWallet'
>;

export type SyncOutcome =
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
      gaps: ReturnType<typeof mergeGaps>;
      noRefineries?: true;
      missing: MissingSource[];
      truncated: boolean;
      autoGrouped: number;
      autoGroupError?: string;
      groupPrompts?: MergePrompt[];
      groupFlagged?: number[];
      reassignError?: string;
    };

export type MissingSource = 'extractions' | 'donations' | 'ore';

const paymentId = (d: JournalDonation) => `j${d.division}_${d.refId}`;

export async function syncCorpTaxBook(
  args: { characterId: number; corporationId: number; capabilities: SyncCapabilities },
  deps: SyncDeps = defaultSyncDeps
): Promise<SyncOutcome> {
  const { characterId, corporationId, capabilities } = args;
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
    capabilities.canReadWallet
      ? deps
          .loadDonations(characterId, corporationId, otherDivisions(before.book.divisions), {
            whole: true,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  if (feedRead === 'needs-reauth') return { kind: 'skipped', reason: 'needs-reauth' };
  if (feedRead === 'unavailable') return { kind: 'skipped', reason: 'esi-unavailable' };
  const noRefineries = feedRead === 'no-refineries';
  const feed: ObserverFeed = noRefineries
    ? { rows: [], structureIds: [], oldestEsiDate: {}, truncated: false, systemIds: {} }
    : feedRead;
  if (canExtract && esiExtractions === null) missing.push('extractions');
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
  const rows = [
    ...feed.rows,
    ...(await billedStoredRows(deps, characterId, corporationId, before, feed.rows, fresh)),
  ] as ObservedRow[];
  const mined = new Set(rows.map((r) => r.characterId));
  const matching = donationMatchBook({
    miners: before.miners,
    notices: before.notices,
    minedCharacterIds: mined,
    payments: before.payments,
  });
  const uncounted =
    elsewhere === null
      ? undefined
      : noteUncountedDonations(
          elsewhere,
          matching,
          minedSinceStart(rows, before.miners, before.book.startDate)
        );

  const placed = placeObservedRows(
    feed.rows as ObservedRow[],
    canExtract ? extractions : before.extractions,
    feed.systemIds
  );
  const batches = chunk(placed, OBSERVED_PER_CALL);
  const extraCalls = chunk(extractions, EXTRACTIONS_PER_CALL);
  const first = { observed: batches.shift() ?? [], extractions: extraCalls.shift() ?? [] };
  await deps.verifyOfficer(characterId, corporationId);
  const receipt = await deps.uploadSync(characterId, {
    corporationId,
    ...first,
    donations: fresh,
    gaps,
    ...(uncounted ? { uncounted } : {}),
    donationsRead: capabilities.canReadWallet && donations !== null,
  });
  const { donationsAdded } = receipt;
  for (const observed of batches) {
    await deps.uploadSync(characterId, { corporationId, observed, gaps });
  }
  for (const rest of extraCalls) {
    await deps.uploadSync(characterId, { corporationId, extractions: rest, gaps });
  }

  if (capabilities.canReadWallet && donations !== null) {
    await deps
      .reconcilePayouts?.(characterId, corporationId, before.book.divisions)
      .catch(() => undefined);
  }

  const {
    grouped: autoGrouped,
    error: autoGroupError,
    prompts: groupPrompts,
    flagged: groupFlagged,
  } = await autoGroup(deps, characterId, corporationId, before.miners, recordCounts(before));

  const { error: reassignError } = await reassignUnmatched(deps, characterId, corporationId, {
    before,
    mined,
    rows,
    regrouped: autoGrouped > 0,
  });

  return {
    kind: 'synced',
    observedRows: feed.rows.length,
    extractions: extractions.length,
    donationsAdded,
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
  const feedOnly = donationMatchBook({
    miners: book.miners,
    notices: book.notices,
    minedCharacterIds: new Set(feedRows.map((r) => r.characterId)),
    payments: book.payments,
  });
  const senders = [
    ...new Set(
      fresh
        .filter((d) => {
          return donationOwner(d, feedOnly).kind !== 'miner';
        })
        .map((d) => d.characterId)
    ),
  ];
  const wanted = storedRowsWanted({
    held,
    senders,
    miners: book.miners,
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

async function reassignUnmatched(
  deps: SyncDeps,
  characterId: number,
  corporationId: number,
  args: {
    before: BookState;
    mined: ReadonlySet<number>;
    rows: readonly ObservedRow[];
    regrouped: boolean;
  }
): Promise<{ assigned: number; error?: string }> {
  const open = args.before.payments.filter((p) => p.minerId === undefined);
  if (open.length === 0) return { assigned: 0 };
  let assigned = 0;
  let error: string | undefined;
  try {
    const book = args.regrouped
      ? ((await deps.readBookState(characterId, corporationId)) ?? args.before)
      : args.before;
    const matchBook = donationMatchBook({
      miners: book.miners,
      notices: book.notices,
      minedCharacterIds: args.mined,
      payments: book.payments,
    });
    for (const { paymentId, minerId } of rematchUnmatched(
      open as readonly UnmatchedCandidate[],
      matchBook,
      utcDay(deps.now())
    )) {
      try {
        await deps.assignPayment(characterId, corporationId, paymentId, minerId);
        assigned += 1;
      } catch (e) {
        error ??= e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    error ??= e instanceof Error ? e.message : String(e);
  }
  return { assigned, ...(error !== undefined ? { error } : {}) };
}

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

function recordCounts(book: BookState): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const n of book.notices) bump(n.minerId);
  for (const p of book.payments) bump(p.minerId);
  for (const d of book.dismissals as { minerId?: string }[]) bump(d.minerId);
  for (const w of book.writeOffs ?? []) bump((w as { minerId?: string }).minerId);
  return counts;
}
