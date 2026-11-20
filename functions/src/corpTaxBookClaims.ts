/**
 * Officer claims inside a Miner (Player slice): an officer-added character is billed with the
 * group but cannot read it until its owner signs in as it (a Self-proven link). Pure: the store
 * reads the facts, this decides who reads, who is claimed and what a sign-in promotes.
 */

export interface GroupConflict {
  characterId: number;
  minerIds: string[];
  at: string;
}

export interface ClassifyInput {
  characterIds: readonly number[];
  mainCharacterId: number;
  /** Characters that already read the group (members before this edit, legacy confirmations). */
  retained: ReadonlySet<number>;
  /** Legacy guests still awaiting the old confirmation; kept pending while members. */
  pending: ReadonlySet<number>;
  /** Characters with a Self-proven link. */
  proven: ReadonlySet<number>;
  /** Characters recorded mining for another corporation. */
  outside: ReadonlySet<number>;
  /** Characters recorded mining for this corporation. */
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

/** The characters that read a Miner: everyone but officer claims and legacy unconfirmed guests. */
export function minerReaderIds(m: {
  characterIds: readonly number[];
  officerClaimed?: readonly number[];
  pendingConfirmation?: readonly number[];
}): number[] {
  const held = new Set([...(m.officerClaimed ?? []), ...(m.pendingConfirmation ?? [])]);
  return m.characterIds.filter((id) => !held.has(id));
}

export interface ClaimMiner {
  id: string;
  characterIds: readonly number[];
  officerClaimed: readonly number[];
  provenCharacterIds: readonly number[];
  /** When the group was first written; absent on groups made before the Player slice. */
  createdAt?: string;
}

const earlier = (a: ClaimMiner, b: ClaimMiner) =>
  (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);

/** Characters stored in more than one Miner group (a `solo:` id holds none); earlier group first. */
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
  /** The characters that now read the group. */
  characterIds: number[];
  officerClaimed: number[];
  provenCharacterIds: number[];
}

/**
 * Moves each proven officer claim into the proven list. A character stored in two groups is
 * promoted only in the earlier one (the conflict is shown to an officer, never last-writer-wins).
 */
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
