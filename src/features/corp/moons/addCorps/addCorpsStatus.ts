/**
 * What state each of the player's corporations is in after (or during) an
 * "Add my other corps" run. Pure: reads the persisted run's outcomes and the
 * book's moon owner rows, so the Needs you panel and the sign-in list agree.
 */
import type { AddCorpsOutcome, AddCorpsRun } from '@/engine/corpTaxBook/addCorpsRun';

export type CorpState =
  | 'ready'
  | 'connected'
  | 'needs-sign-in'
  | 'needs-role'
  | 'own-book'
  | 'gone-quiet'
  | 'failed'
  // Read without refinery names (a grant from before the structure scope, decision 20261021-084219):
  // one the player can sign in for again, and one only its own officer can.
  | 'needs-names'
  | 'names-not-shared';

export type NeedsYouState = Exclude<CorpState, 'ready' | 'connected'>;

/** The refusals that already mean the corporation is a moon owner here. */
const CONNECTED_REASONS = new Set(['already-feeder']);

/** The state one run outcome leaves a corporation in (`ready` when it has none yet). */
export function stateOfOutcome(outcome: AddCorpsOutcome | undefined): CorpState {
  if (!outcome) return 'ready';
  switch (outcome.kind) {
    case 'connected':
      return 'connected';
    case 'refused':
      if (CONNECTED_REASONS.has(outcome.reason)) return 'connected';
      if (outcome.reason === 'not-an-accountant') return 'needs-role';
      if (outcome.reason === 'own-book-exists') return 'own-book';
      // A wrong character is the player's to fix at the login page; anything else is a
      // failure on the way through (the server, the ledger), not a login that did not finish.
      return outcome.reason === 'wrong-corp' ? 'needs-sign-in' : 'failed';
    default:
      return 'needs-sign-in';
  }
}

/** The slice of a moon owner row the panel reads. */
export interface OwnerRowLike {
  corporationId: number;
  status: string;
  sameOwner?: boolean;
  /** Whether its grant reads refinery names; absent until its first read since #4654. */
  readsStructureNames?: boolean;
}

export interface NeedsYouItem {
  corporationId: number;
  name: string;
  state: NeedsYouState;
  /** For a refusal with no fixed wording: its reason code, read through `addCorpsErrorText`. */
  reason?: string;
}

/** Whether a moon owner row of the player's own is no longer being read. */
export const isGoneQuiet = (row: OwnerRowLike): boolean =>
  row.sameOwner === true && (row.status === 'cant-read' || row.status === 'disconnected');

/** Moon owner statuses the sync still reads (a removal or a disconnect asks for nothing else). */
const READ = new Set(['active', 'no-rate', 'settled-otherwise']);

/** Whether a moon owner the book reads came without refinery names. */
const lacksNames = (row: OwnerRowLike): boolean =>
  row.readsStructureNames === false && READ.has(row.status);

/** Whether an item is the player's to fix (counted), rather than information about another officer's. */
export const needsThePlayer = (item: NeedsYouItem): boolean => item.state !== 'names-not-shared';

/**
 * Corporations that need the player: run outcomes that did not connect, and the
 * player's own moon owners that stopped answering, and moon owners read without
 * refinery names: `needs-names` for one of the player's own that they can sign in
 * as the CEO of (`grantable`), `names-not-shared` for the rest. A corporation the
 * book now reads well is never listed, whatever the run once said about it.
 */
export function needsYou(
  run: AddCorpsRun | null,
  rows: readonly OwnerRowLike[],
  name: (corporationId: number) => string,
  grantable: ReadonlySet<number> = new Set()
): NeedsYouItem[] {
  const items = new Map<number, NeedsYouItem>();
  const reading = new Set(
    rows.filter((r) => !isGoneQuiet(r) && r.status === 'active').map((r) => r.corporationId)
  );
  if (run) {
    for (const c of run.queue) {
      const outcome = run.outcomes[c.corporationId];
      const state = stateOfOutcome(outcome);
      if (state === 'ready' || state === 'connected' || reading.has(c.corporationId)) continue;
      items.set(c.corporationId, {
        corporationId: c.corporationId,
        name: c.name,
        state: state as NeedsYouState,
        ...(outcome?.kind === 'refused' && (state === 'needs-sign-in' || state === 'failed')
          ? { reason: outcome.reason }
          : {}),
      });
    }
  }
  for (const r of rows) {
    if (isGoneQuiet(r)) {
      items.set(r.corporationId, {
        corporationId: r.corporationId,
        name: name(r.corporationId),
        state: 'gone-quiet',
      });
    } else if (lacksNames(r) && !items.has(r.corporationId)) {
      items.set(r.corporationId, {
        corporationId: r.corporationId,
        name: name(r.corporationId),
        state:
          r.sameOwner === true && grantable.has(r.corporationId)
            ? 'needs-names'
            : 'names-not-shared',
      });
    }
  }
  return [...items.values()];
}

/** How many of the run's corporations are connected (for "8 of 12 connected"). */
export function connectedInRun(run: AddCorpsRun): number {
  return run.queue.filter((c) => stateOfOutcome(run.outcomes[c.corporationId]) === 'connected')
    .length;
}
