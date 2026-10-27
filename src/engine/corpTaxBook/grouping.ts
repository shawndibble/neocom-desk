/**
 * Miner grouping (D18, D26/D26b, issue #4194): the `setMiner` / `unlink` / `regroupMiner` edits
 * that put characters into one Miner, planned as pure data so the screen and
 * the sync run the same rules. Pure: no fetch/DOM/Dexie imports.
 *
 * A group keeps the id of the Miner it grows from (`solo:<id>` included), so
 * its Statements, payments and dismissals stay with it.
 */
import type { Miner } from './charges';

export type GroupingEdit =
  | { action: 'setMiner'; minerId: string; characterIds: number[]; mainCharacterId: number }
  | { action: 'unlink'; minerId: string; characterId: number };

const isSolo = (id: string) => id.startsWith('solo:');

/**
 * The one edit that folds `absorb` into the target Miner. A character sits in
 * one stored Miner only, so the server dissolves each absorbed stored group
 * and sets the target in a single transaction: a partial failure cannot leave
 * characters unlinked. A `solo:` Miner is not stored and is not listed.
 */
export type RegroupEdit = {
  action: 'regroupMiner';
  minerId: string;
  characterIds: number[];
  mainCharacterId: number;
  absorbMinerIds: string[];
};

export function planRegroup(input: {
  miners: readonly Miner[];
  targetId: string;
  targetCharacterIds: readonly number[];
  absorb: readonly { id: string; characterIds: readonly number[] }[];
  mainCharacterId: number;
}): RegroupEdit {
  const characterIds = [
    ...new Set([...input.targetCharacterIds, ...input.absorb.flatMap((a) => a.characterIds)]),
  ];
  if (!characterIds.includes(input.mainCharacterId)) {
    throw new Error('The main must be one of the grouped characters');
  }
  const stored = new Set(input.miners.map((m) => m.id));
  return {
    action: 'regroupMiner',
    minerId: input.targetId,
    characterIds,
    mainCharacterId: input.mainCharacterId,
    absorbMinerIds: input.absorb.filter((o) => !isSolo(o.id) && stored.has(o.id)).map((o) => o.id),
  };
}

/**
 * D26: the characters on one app account that are in the book's corporation
 * group automatically, so one payment covers them. Only ungrouped characters
 * move, and never one an officer unlinked (`declined`). Characters outside the
 * corp are never linked here (D26b) — the caller passes only what the account
 * itself holds.
 */
export function planAutoGroups(input: {
  corporationId: number;
  accountCharacters: readonly { characterId: number; corporationId: number }[];
  miners: readonly Miner[];
  declined: ReadonlySet<number>;
  preferredMain?: number;
}): GroupingEdit[] {
  const grouped = new Set(input.miners.flatMap((m) => m.characterIds));
  const free = [
    ...new Set(
      input.accountCharacters
        .filter(
          (c) =>
            c.corporationId === input.corporationId &&
            !grouped.has(c.characterId) &&
            !input.declined.has(c.characterId)
        )
        .map((c) => c.characterId)
    ),
  ].sort((a, b) => a - b);
  if (free.length < 2) return [];
  const main =
    input.preferredMain !== undefined && free.includes(input.preferredMain)
      ? input.preferredMain
      : free[0];
  return [
    { action: 'setMiner', minerId: `solo:${main}`, characterIds: free, mainCharacterId: main },
  ];
}
