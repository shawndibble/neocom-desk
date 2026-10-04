/**
 * Route Safety's Ansiblex list (issue #2478): the jump gates the pilot's
 * characters can use, kept on this device only.
 *
 * Public ESI lists no Ansiblex. A character's structure search finds the ones
 * that character can see — searching " » ", since every gate is named
 * "SYS1 » SYS2 - …" and ESI will not search fewer than three characters —
 * and each id is read through `/universe/structures/{id}`. Each character
 * finds only what it has access to, so each one's finds are merged, and the
 * list says who found each gate. A pasted list is the other way in.
 *
 * Structure access is private alliance information: the list lives in Dexie
 * alone, never synced, never sent to Firebase, never logged.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AnsiblexGateRecord } from '@/db';
import {
  ANSIBLEX_SEARCH,
  foundGate,
  type AnsiblexGate,
  type SystemLookup,
} from '@/engine/route/ansiblex';
import { getCharacterSearch } from '@/esi/endpoints';
import { loadStructureInfo } from '@/features/character/structures';

export type { AnsiblexGateRecord };

const SEARCH_PREFIX = 'search:';

function pastedId(gate: AnsiblexGate): string {
  const [low, high] = gate.fromId < gate.toId ? [gate.fromId, gate.toId] : [gate.toId, gate.fromId];
  return `paste:${low}:${high}`;
}

/** Every known gate, by id. */
export async function gatesOf(): Promise<AnsiblexGateRecord[]> {
  return db.ansiblexGates.orderBy('id').toArray();
}

/** The known gates, live; `undefined` while the first read is in flight. */
export function useAnsiblexGates(): AnsiblexGateRecord[] | undefined {
  return useLiveQuery(gatesOf, []);
}

/**
 * What one character's search came to: how many gates it found, and the far
 * systems of any it could not place; or `failed` when the search itself could
 * not be run, which leaves the list as it was.
 */
export type FindGatesOutcome =
  { kind: 'found'; count: number; unknown: string[] } | { kind: 'failed' };

/**
 * Runs one character's structure search and saves what it finds. The
 * character's finds replace its earlier ones: a gate no other character found
 * and this one no longer sees leaves the list.
 */
export async function findGatesWithCharacter(
  characterId: number,
  lookup: SystemLookup,
  signal?: AbortSignal
): Promise<FindGatesOutcome> {
  let ids: number[];
  try {
    const result = await getCharacterSearch(characterId, ['structure'], ANSIBLEX_SEARCH, {
      signal,
    });
    ids = result.data?.structure ?? [];
  } catch {
    return { kind: 'failed' };
  }

  const found = new Map<number, AnsiblexGate>();
  const unknown = new Set<string>();
  for (const structureId of ids) {
    if (signal?.aborted) return { kind: 'failed' };
    // A structure this character cannot read (a 403) is simply not a gate it can use.
    const structure = await loadStructureInfo(characterId, structureId).catch(() => null);
    if (!structure) continue;
    const read = foundGate(structure, lookup);
    if (read.kind === 'gate') found.set(structureId, read.gate);
    else if (read.kind === 'unknown') for (const name of read.names) unknown.add(name);
  }

  const now = Date.now();
  await db.transaction('rw', db.ansiblexGates, async () => {
    const earlier = await db.ansiblexGates.where('id').startsWith(SEARCH_PREFIX).toArray();
    for (const record of earlier) {
      const structureId = Number(record.id.slice(SEARCH_PREFIX.length));
      if (found.has(structureId) || !record.foundBy.includes(characterId)) continue;
      const foundBy = record.foundBy.filter((id) => id !== characterId);
      if (foundBy.length === 0) await db.ansiblexGates.delete(record.id);
      else await db.ansiblexGates.put({ ...record, foundBy });
    }
    for (const [structureId, gate] of found) {
      const id = `${SEARCH_PREFIX}${structureId}`;
      const before = earlier.find((record) => record.id === id);
      const earlierFinders = before?.foundBy ?? [];
      await db.ansiblexGates.put({
        id,
        ...gate,
        source: 'search',
        foundBy: earlierFinders.includes(characterId)
          ? earlierFinders
          : [...earlierFinders, characterId],
        savedAt: now,
      });
    }
  });
  return { kind: 'found', count: found.size, unknown: [...unknown].sort() };
}

/** Saves pasted gates. A pair already pasted, either way round, is kept as it was. */
export async function savePastedGates(gates: readonly AnsiblexGate[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.ansiblexGates, async () => {
    for (const gate of gates) {
      const id = pastedId(gate);
      if (await db.ansiblexGates.get(id)) continue;
      await db.ansiblexGates.put({ id, ...gate, source: 'paste', foundBy: [], savedAt: now });
    }
  });
}

export async function removeAnsiblexGate(id: string): Promise<void> {
  await db.ansiblexGates.delete(id);
}
