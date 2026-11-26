import { standingOf, type MinerRow } from './bookView';
import { latestRecordedCorp } from './bookDocs';
import type { Miner } from './charges';
import type { ObservedMiningEntry } from './types';

export type GroupingEdit =
  | { action: 'setMiner'; minerId: string; characterIds: number[]; mainCharacterId: number }
  | { action: 'unlink'; minerId: string; characterId: number; leftOn?: string };

const isSolo = (id: string) => id.startsWith('solo:');

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

export const REGROUP_WRITE_CAP = 450;

export type MergePrompt = {
  minerIds: string[];
  characterIds: number[];
  reason: 'too-large' | 'conflict';
};

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

export type MinerChoice = Pick<MinerRow, 'id' | 'mainCharacterId' | 'characterIds' | 'standing'>;

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
