/**
 * "Finish setting up {character}" (issue #6103): after a sign-in lands, what
 * else that Character can usefully approve at EVE while the player is still
 * signed in to its EVE account, and the short chain that walks them. Pure: the
 * caller reads the Character's corporation, the book the account edits, the
 * Alerts Grants and the player's Not now answers.
 *
 * Each approval is its own SSO round trip with its own narrow token (ADR 0020,
 * ADR 0025); this only decides which to offer and in what order.
 */

export type ApprovalKind = 'moon' | 'alerts';

export type Approval =
  | {
      kind: 'moon';
      corporationId: number;
      corporationName: string;
      collectorCorporationId: number;
      editorCharacterId: number;
    }
  /** `nearby` / `mail`: the optional scopes the sign-in asks for beside notifications (listed first). */
  | { kind: 'alerts'; nearby?: boolean; mail?: boolean };

export interface FinishSetupInput {
  characterId: number;
  /** The corporation this Character is CEO of right now, if any. */
  ceoOf?: { corporationId: number; name: string };
  /** A Corp Tax Book the account edits, and the corporations already on it. */
  book?: { collectorCorporationId: number; editorCharacterId: number; onBook: readonly number[] };
  /** Corporations the player hid from "Add my other corps". */
  hiddenCorporationIds: readonly number[];
  /** Whether closed-app alerts are on for at least one other Character on the account. */
  alertsOnElsewhere: boolean;
  /** Whether this Character's Alerts Grant is active. */
  alertsHeld: boolean;
  /** What the player said Not now to for this Character. */
  notNow: readonly ApprovalKind[];
}

/** Moon book first: its sign-in is the one EVE asks a CEO for, alerts is one more press after it. */
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

/** How one approval's round trip came back. */
export type ApprovalResult =
  | { kind: ApprovalKind; result: 'done' | 'not-done' }
  | { kind: ApprovalKind; result: 'refused'; reason: string }
  | { kind: ApprovalKind; result: 'wrong-character'; signedInAs: string };

export interface FinishSetupChain {
  characterId: number;
  name: string;
  items: Approval[];
  /** Index of the approval being done; `items.length` once finished. */
  index: number;
  /** The latest result, for the note on the next screen. */
  last?: ApprovalResult;
  /** How each finished approval ended, for the list. */
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

/**
 * Record how the current approval went. A wrong character approves nothing and
 * leaves the chain on the same item; anything else moves on. A result for an
 * approval that is not the current one changes nothing.
 */
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
