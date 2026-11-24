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
  | 'names-not-shared'
  // Read without each chunk's ore (a grant from before the notifications scope): one of the
  // player's own they can sign in for again. Another officer's is told on its chunks instead.
  | 'needs-ore';

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
  /** Whether its grant reads the Extraction started notifications; absent until a read says. */
  readsNotifications?: boolean;
}

export interface NeedsYouItem {
  corporationId: number;
  name: string;
  state: NeedsYouState;
  /** For a refusal with no fixed wording: its reason code, read through `addCorpsErrorText`. */
  reason?: string;
  /** `needs-names` whose grant also reads no chunk ore: the one Grant again fixes both. */
  alsoOre?: true;
  /** The CEO to log in as, when the fix is a login and the player's character leads the corp. */
  ceoName?: string;
}

/** Run states fixed by logging in again as the queued CEO (a changed CEO is `failed`: not them). */
const LOGIN_AS_CEO = new Set<CorpState>(['needs-sign-in', 'needs-role']);

/** Whether a moon owner row of the player's own is no longer being read. */
export const isGoneQuiet = (row: OwnerRowLike): boolean =>
  row.sameOwner === true && (row.status === 'cant-read' || row.status === 'disconnected');

/** Moon owner statuses the sync still reads (a removal or a disconnect asks for nothing else). */
const READ = new Set(['active', 'rate-asked', 'no-rate', 'settled-otherwise']);

/** Whether a moon owner the book reads came without refinery names. */
const lacksNames = (row: OwnerRowLike): boolean =>
  row.readsStructureNames === false && READ.has(row.status);

/** Whether a moon owner the book reads came without each chunk's ore. */
const lacksOre = (row: OwnerRowLike): boolean =>
  row.readsNotifications === false && READ.has(row.status);

/** Whether an item's fix is Grant again: an own corp read without names or without the ore. */
export const offersGrantAgain = (item: Pick<NeedsYouItem, 'state'>): boolean =>
  item.state === 'needs-names' || item.state === 'needs-ore';

/** Whether a gone-quiet own corp can be logged in again here: the player leads it, so there is a CEO to name. */
export const offersLoginAgain = (item: Pick<NeedsYouItem, 'state' | 'ceoName'>): boolean =>
  item.state === 'gone-quiet' && item.ceoName !== undefined;

/** Whether an item is the player's to fix (counted), rather than information about another officer's. */
export const needsThePlayer = (item: NeedsYouItem): boolean => item.state !== 'names-not-shared';

/**
 * Corporations that need the player: run outcomes that did not connect, and the
 * player's own moon owners that stopped answering, and moon owners read without
 * refinery names: `needs-names` for one of the player's own that they can sign in
 * as the CEO of (`ceoByCorp`), `names-not-shared` for the rest. One of those own
 * ones read without each chunk's ore is `needs-ore` (names, when both lack, since
 * the one Grant again fixes both). A row fixed by a login names the CEO to log in
 * as. A corporation the book now reads well is never listed, whatever the run once
 * said about it.
 */
export function needsYou(
  run: AddCorpsRun | null,
  rows: readonly OwnerRowLike[],
  name: (corporationId: number) => string,
  /** The player's own corps they are the CEO of, each with that CEO's name. */
  ceoByCorp: ReadonlyMap<number, string> = new Map()
): NeedsYouItem[] {
  // An own corp the player can Grant again for: the CEO to log in as, else undefined.
  const grantCeo = (r: OwnerRowLike) =>
    r.sameOwner === true ? ceoByCorp.get(r.corporationId) : undefined;
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
        ...(LOGIN_AS_CEO.has(state) ? { ceoName: c.ceoName } : {}),
        ...(outcome?.kind === 'refused' && (state === 'needs-sign-in' || state === 'failed')
          ? { reason: outcome.reason }
          : {}),
      });
    }
  }
  for (const r of rows) {
    if (isGoneQuiet(r)) {
      // The player's own corp: logging in again as its CEO replaces the lost grant.
      const ceoName = grantCeo(r);
      items.set(r.corporationId, {
        corporationId: r.corporationId,
        name: name(r.corporationId),
        state: 'gone-quiet',
        ...(ceoName === undefined ? {} : { ceoName }),
      });
    } else if (lacksNames(r) && !items.has(r.corporationId)) {
      const ceoName = grantCeo(r);
      items.set(r.corporationId, {
        corporationId: r.corporationId,
        name: name(r.corporationId),
        state: ceoName === undefined ? 'names-not-shared' : 'needs-names',
        ...(ceoName === undefined ? {} : { ceoName }),
        ...(ceoName !== undefined && lacksOre(r) ? { alsoOre: true as const } : {}),
      });
    } else if (lacksOre(r) && !items.has(r.corporationId)) {
      const ceoName = grantCeo(r);
      if (ceoName === undefined) continue;
      items.set(r.corporationId, {
        corporationId: r.corporationId,
        name: name(r.corporationId),
        state: 'needs-ore',
        ceoName,
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
