/**
 * Miner grouping (D18, D26/D26b, issue #4194): the `setMiner` / `unlink` / `regroupMiner` edits
 * that put characters into one Miner, planned as pure data so the screen and
 * the sync run the same rules. Pure: no fetch/DOM/Dexie imports.
 *
 * A group keeps the id of the Miner it grows from (`solo:<id>` included), so
 * its late notices, payments and dismissals stay with it.
 */
import { standingOf, type MinerRow } from './bookView';
import { latestRecordedCorp } from './bookDocs';
import type { Miner } from './charges';
import type { ObservedMiningEntry } from './types';

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

/** Mirror of the server's regroup cap (`regroup-too-large` in functions/src/corpTaxBookStore.ts). */
export const REGROUP_WRITE_CAP = 450;

export type MergePrompt = {
  minerIds: string[];
  characterIds: number[];
  reason: 'too-large' | 'conflict';
};

/**
 * Sign-in grouping: the player's own (proven) characters group in this
 * corporation's book. Free corp members group via setMiner; Miners the player
 * touches merge by regroup while the records moved fit one transaction, else an
 * officer gets a prompt. A character in two groups is a conflict prompt, a
 * declined one is flagged and never added, and an outsider is never the main of
 * a group that has a corp member. Only characters in `corporationId`, plus
 * outsiders a group here already holds, are acted on.
 */
export function planSignInGroups(i: {
  corporationId: number;
  proven: readonly { characterId: number; corporationId: number | null }[];
  miners: readonly Miner[];
  declined: ReadonlySet<number>;
  preferredMain?: number;
  recordCountByMiner?: ReadonlyMap<string, number>;
}): { edits: (GroupingEdit | RegroupEdit)[]; prompts: MergePrompt[]; flagged: number[] } {
  const edits: (GroupingEdit | RegroupEdit)[] = [];
  const prompts: MergePrompt[] = [];
  const asc = (a: number, b: number) => a - b;
  const provenIds = [...new Set(i.proven.map((c) => c.characterId))].sort(asc);
  const flagged = provenIds.filter((id) => i.declined.has(id));
  const live = provenIds.filter((id) => !i.declined.has(id));
  const isMember = (id: number) =>
    i.proven.some((c) => c.characterId === id && c.corporationId === i.corporationId);
  const isKnownOutsider = (id: number) =>
    i.proven.some((c) => c.characterId === id && c.corporationId !== i.corporationId);
  const minersOf = (id: number) => i.miners.filter((m) => m.characterIds.includes(id));

  // A character in two groups is a conflict; those groups are left alone.
  const blocked = new Set<string>();
  for (const id of live) {
    const held = minersOf(id);
    if (held.length < 2) continue;
    held.forEach((m) => blocked.add(m.id));
    prompts.push({ minerIds: held.map((m) => m.id), characterIds: [id], reason: 'conflict' });
  }

  const touched: Miner[] = [];
  const free: number[] = [];
  for (const id of live) {
    const held = minersOf(id);
    if (held.length === 0) {
      if (isMember(id)) free.push(id);
    } else if (held.length === 1 && !blocked.has(held[0].id) && !touched.includes(held[0])) {
      touched.push(held[0]);
    }
  }

  const pickMain = (ids: readonly number[], keep: number): number => {
    const ok = (id: number) => !(isKnownOutsider(id) && ids.some(isMember));
    if (i.preferredMain !== undefined && ids.includes(i.preferredMain) && ok(i.preferredMain))
      return i.preferredMain;
    if (ok(keep)) return keep;
    return [...ids].sort(asc).find(isMember) ?? keep;
  };

  if (touched.length === 0) {
    if (free.length >= 2) {
      const main = pickMain(free, free[0]);
      edits.push({
        action: 'setMiner',
        minerId: `solo:${main}`,
        characterIds: free,
        mainCharacterId: main,
      });
    }
  } else if (touched.length === 1) {
    if (free.length > 0) {
      const t = touched[0];
      const ids = [...new Set([...t.characterIds, ...free])];
      edits.push({
        action: 'setMiner',
        minerId: t.id,
        characterIds: ids,
        mainCharacterId: pickMain(ids, t.mainCharacterId),
      });
    }
  } else {
    const records = touched.reduce((n, m) => n + (i.recordCountByMiner?.get(m.id) ?? 0), 0);
    const target = touched[0];
    const ids = [...new Set([...touched.flatMap((m) => m.characterIds), ...free])];
    if (records >= REGROUP_WRITE_CAP) {
      prompts.push({
        minerIds: touched.map((m) => m.id),
        characterIds: ids.filter((id) => live.includes(id)),
        reason: 'too-large',
      });
    } else {
      edits.push(
        planRegroup({
          miners: i.miners,
          targetId: target.id,
          targetCharacterIds: [...target.characterIds, ...free],
          absorb: touched.slice(1).map((m) => ({ id: m.id, characterIds: m.characterIds })),
          mainCharacterId: pickMain(ids, target.mainCharacterId),
        })
      );
    }
  }
  return { edits, prompts, flagged };
}

/** A Miner the group dialog can fold in: who it is, and whether it is outside the corp (D26b). */
export type MinerChoice = Pick<MinerRow, 'id' | 'mainCharacterId' | 'characterIds' | 'standing'>;

/**
 * Every Miner the book knows, without the ledger maths (#5704): each stored group, then a
 * `solo:` Miner for every ungrouped character with a ledger row on or after the start date.
 * The Miner page reads one Miner only, so its group dialog builds the list from this.
 */
export function minerChoices(input: {
  corporationId: number;
  startDate?: string;
  miners: readonly Miner[];
  entries: readonly (Pick<ObservedMiningEntry, 'characterId' | 'date' | 'recordedCorporationId'> &
    Partial<Pick<ObservedMiningEntry, 'cachedAt' | 'structureId'>>)[];
  memberIds?: ReadonlySet<number>;
}): MinerChoice[] {
  const latestCorp = latestRecordedCorp(input.entries);
  const grouped = new Set(input.miners.flatMap((m) => m.characterIds));
  const solo = [
    ...new Set(
      input.entries
        .filter((e) => input.startDate === undefined || e.date >= input.startDate)
        .map((e) => e.characterId)
        .filter((id) => !grouped.has(id))
    ),
  ].sort((a, b) => a - b);
  const choice = (id: string, characterIds: number[], mainCharacterId: number): MinerChoice => ({
    id,
    mainCharacterId,
    characterIds,
    standing: standingOf(characterIds, latestCorp, input),
  });
  return [
    ...input.miners.map((m) => choice(m.id, [...m.characterIds], m.mainCharacterId)),
    ...solo.map((c) => choice(`solo:${c}`, [c], c)),
  ];
}
