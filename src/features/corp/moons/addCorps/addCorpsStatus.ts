import type { AddCorpsOutcome, AddCorpsRun } from '@/engine/corpTaxBook/addCorpsRun';

export type CorpState =
  | 'ready'
  | 'connected'
  | 'needs-sign-in'
  | 'needs-role'
  | 'own-book'
  | 'gone-quiet'
  | 'failed'
  | 'needs-names'
  | 'names-not-shared'
  | 'needs-ore';

export type NeedsYouState = Exclude<CorpState, 'ready' | 'connected'>;

const CONNECTED_REASONS = new Set(['already-feeder']);

export function stateOfOutcome(outcome: AddCorpsOutcome | undefined): CorpState {
  if (!outcome) return 'ready';
  switch (outcome.kind) {
    case 'connected':
      return 'connected';
    case 'refused':
      if (CONNECTED_REASONS.has(outcome.reason)) return 'connected';
      if (outcome.reason === 'not-an-accountant') return 'needs-role';
      if (outcome.reason === 'own-book-exists') return 'own-book';
      return outcome.reason === 'wrong-corp' ? 'needs-sign-in' : 'failed';
    default:
      return 'needs-sign-in';
  }
}

export interface OwnerRowLike {
  corporationId: number;
  status: string;
  sameOwner?: boolean;
  readsStructureNames?: boolean;
  readsNotifications?: boolean;
}

export interface NeedsYouItem {
  corporationId: number;
  name: string;
  state: NeedsYouState;
  reason?: string;
  alsoOre?: true;
  ceoName?: string;
}

const LOGIN_AS_CEO = new Set<CorpState>(['needs-sign-in', 'needs-role']);

export const isGoneQuiet = (row: OwnerRowLike): boolean =>
  row.sameOwner === true && (row.status === 'cant-read' || row.status === 'disconnected');

const READ = new Set(['active', 'rate-asked', 'no-rate', 'settled-otherwise']);

const lacksNames = (row: OwnerRowLike): boolean =>
  row.readsStructureNames === false && READ.has(row.status);

const lacksOre = (row: OwnerRowLike): boolean =>
  row.readsNotifications === false && READ.has(row.status);

export const offersGrantAgain = (item: Pick<NeedsYouItem, 'state'>): boolean =>
  item.state === 'needs-names' || item.state === 'needs-ore';

export const offersLoginAgain = (item: Pick<NeedsYouItem, 'state' | 'ceoName'>): boolean =>
  item.state === 'gone-quiet' && item.ceoName !== undefined;

export const needsThePlayer = (item: NeedsYouItem): boolean => item.state !== 'names-not-shared';

export function needsYou(
  run: AddCorpsRun | null,
  rows: readonly OwnerRowLike[],
  name: (corporationId: number) => string,
  ceoByCorp: ReadonlyMap<number, string> = new Map()
): NeedsYouItem[] {
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

export function connectedInRun(run: AddCorpsRun): number {
  return run.queue.filter((c) => stateOfOutcome(run.outcomes[c.corporationId]) === 'connected')
    .length;
}
