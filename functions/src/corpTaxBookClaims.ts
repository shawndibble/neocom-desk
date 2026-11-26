import { earlierGrouping, soloCharacterId } from './corpTaxBookDonationMatch.js';

export interface GroupConflict {
  characterId: number;
  minerIds: string[];
  at: string;
}

export interface ClassifyInput {
  characterIds: readonly number[];
  mainCharacterId: number;
  retained: ReadonlySet<number>;
  pending: ReadonlySet<number>;
  proven: ReadonlySet<number>;
  outside: ReadonlySet<number>;
  minedHere: ReadonlySet<number>;
}

export function classifyGroup(i: ClassifyInput): {
  officerClaimed: number[];
  pendingConfirmation: number[];
  provenCharacterIds: number[];
  readers: number[];
  outsiderMain: boolean;
} {
  const officerClaimed: number[] = [];
  const pendingConfirmation: number[] = [];
  const provenCharacterIds: number[] = [];
  const readers: number[] = [];
  for (const id of i.characterIds) {
    if (i.proven.has(id)) {
      provenCharacterIds.push(id);
      readers.push(id);
    } else if (i.pending.has(id)) pendingConfirmation.push(id);
    else if (i.retained.has(id)) readers.push(id);
    else if (i.outside.has(id) || !i.minedHere.has(id)) officerClaimed.push(id);
    else readers.push(id);
  }
  const hasMember = i.characterIds.some((id) => !i.outside.has(id));
  return {
    officerClaimed,
    pendingConfirmation,
    provenCharacterIds,
    readers,
    outsiderMain: hasMember && i.outside.has(i.mainCharacterId),
  };
}

export function minerReaderIds(m: {
  characterIds: readonly number[];
  officerClaimed?: readonly number[];
  pendingConfirmation?: readonly number[];
}): number[] {
  const held = new Set([...(m.officerClaimed ?? []), ...(m.pendingConfirmation ?? [])]);
  return m.characterIds.filter((id) => !held.has(id));
}

export function minerUidsOf(
  minerId: string,
  miner:
    | {
        characterIds: readonly number[];
        officerClaimed?: readonly number[];
        pendingConfirmation?: readonly number[];
      }
    | undefined
): string[] {
  const solo = soloCharacterId(minerId);
  const ids = miner ? minerReaderIds(miner) : solo === undefined ? [] : [solo];
  return ids.map((id) => `char:${id}`);
}

export interface ClaimMiner {
  id: string;
  characterIds: readonly number[];
  officerClaimed: readonly number[];
  provenCharacterIds: readonly number[];
  createdAt?: string;
}

const earlier = earlierGrouping;

export function groupConflicts(miners: readonly ClaimMiner[], at: string): GroupConflict[] {
  const by = new Map<number, ClaimMiner[]>();
  for (const m of [...miners].sort(earlier))
    for (const id of m.characterIds) by.set(id, [...(by.get(id) ?? []), m]);
  return [...by]
    .filter(([, ms]) => ms.length > 1)
    .map(([characterId, ms]) => ({ characterId, minerIds: ms.map((m) => m.id), at }))
    .sort((a, b) => a.characterId - b.characterId);
}

export interface Promotion {
  minerId: string;
  characterIds: number[];
  officerClaimed: number[];
  provenCharacterIds: number[];
}

export function promoteClaims(
  miners: readonly ClaimMiner[],
  proven: ReadonlySet<number>
): Promotion[] {
  const winner = new Map<number, string>();
  for (const m of [...miners].sort(earlier))
    for (const id of m.characterIds) if (!winner.has(id)) winner.set(id, m.id);
  const out: Promotion[] = [];
  for (const m of miners) {
    const now = m.officerClaimed.filter((id) => proven.has(id) && winner.get(id) === m.id);
    if (now.length === 0) continue;
    out.push({
      minerId: m.id,
      characterIds: now,
      officerClaimed: m.officerClaimed.filter((id) => !now.includes(id)),
      provenCharacterIds: [...new Set([...m.provenCharacterIds, ...now])],
    });
  }
  return out;
}
