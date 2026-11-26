export type ApprovalKind = 'moon' | 'alerts';

export type Approval =
  | {
      kind: 'moon';
      corporationId: number;
      corporationName: string;
      collectorCorporationId: number;
      editorCharacterId: number;
    }
  | { kind: 'alerts'; nearby?: boolean; mail?: boolean };

export interface FinishSetupInput {
  characterId: number;
  ceoOf?: { corporationId: number; name: string };
  book?: { collectorCorporationId: number; editorCharacterId: number; onBook: readonly number[] };
  hiddenCorporationIds: readonly number[];
  alertsOnElsewhere: boolean;
  alertsHeld: boolean;
  notNow: readonly ApprovalKind[];
}

export function stillToApprove(input: FinishSetupInput): Approval[] {
  const items: Approval[] = [];
  const { ceoOf, book } = input;
  if (
    ceoOf &&
    book &&
    !input.notNow.includes('moon') &&
    ceoOf.corporationId !== book.collectorCorporationId &&
    !book.onBook.includes(ceoOf.corporationId) &&
    !input.hiddenCorporationIds.includes(ceoOf.corporationId)
  ) {
    items.push({
      kind: 'moon',
      corporationId: ceoOf.corporationId,
      corporationName: ceoOf.name,
      collectorCorporationId: book.collectorCorporationId,
      editorCharacterId: book.editorCharacterId,
    });
  }
  if (input.alertsOnElsewhere && !input.alertsHeld && !input.notNow.includes('alerts')) {
    items.push({ kind: 'alerts' });
  }
  return items;
}

export function isFinished(chain: FinishSetupChain): boolean {
  return chain.index >= chain.items.length;
}

export type ApprovalResult =
  | { kind: ApprovalKind; result: 'done' | 'not-done' }
  | { kind: ApprovalKind; result: 'refused'; reason: string }
  | { kind: ApprovalKind; result: 'wrong-character'; signedInAs: string };

export interface FinishSetupChain {
  characterId: number;
  name: string;
  items: Approval[];
  index: number;
  last?: ApprovalResult;
  results: Partial<Record<ApprovalKind, 'done' | 'not-done'>>;
}

export function startFinishSetup(args: {
  characterId: number;
  name: string;
  items: Approval[];
}): FinishSetupChain {
  return {
    characterId: args.characterId,
    name: args.name,
    items: args.items,
    index: 0,
    results: {},
  };
}

export function currentApproval(chain: FinishSetupChain): Approval | undefined {
  return chain.items[chain.index];
}

export function recordApproval(chain: FinishSetupChain, result: ApprovalResult): FinishSetupChain {
  if (currentApproval(chain)?.kind !== result.kind) return chain;
  if (result.result === 'wrong-character') return { ...chain, last: result };
  return {
    ...chain,
    index: chain.index + 1,
    last: result,
    results: { ...chain.results, [result.kind]: result.result === 'done' ? 'done' : 'not-done' },
  };
}
