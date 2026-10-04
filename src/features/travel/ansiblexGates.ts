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
  bridgePairKey,
  foundGate,
  type AnsiblexGate,
  type SystemLookup,
} from '@/engine/route/ansiblex';
import { getCharacterSearch } from '@/esi/endpoints';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { loadStructureInfo } from '@/features/character/structures';

export type { AnsiblexGateRecord };

const SEARCH_PREFIX = 'search:';

/** What a structure search for Ansiblex calls. */
export const ANSIBLEX_SEARCH_ENDPOINTS: readonly EsiEndpointId[] = [
  'getCharacterSearch',
  'getUniverseStructure',
];

function pastedId(gate: AnsiblexGate): string {
  return `paste:${bridgePairKey(gate.fromId, gate.toId)}`;
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
 * What one character's search came to: how many gates it found, and the
 * systems of any it could not place; `no-scope` for a character whose grant
 * lacks the search, which is never asked; or `failed` when the search itself
 * could not be run. Neither of the last two changes the list.
 */
export type FindGatesOutcome =
  { kind: 'no-scope' } | { kind: 'found'; count: number; unknown: string[] } | { kind: 'failed' };

/**
 * Runs one character's structure search and saves what it finds. The
 * character's finds replace its earlier ones: a gate no other character found
 * and this one no longer sees leaves the list.
 */
export async function findGatesWithCharacter(
  characterId: number,
  lookup: SystemLookup
): Promise<FindGatesOutcome> {
  const held = new Set((await db.tokens.get(characterId))?.scopes ?? []);
  if (requiredScopesForEndpoints(ANSIBLEX_SEARCH_ENDPOINTS).some((scope) => !held.has(scope))) {
    return { kind: 'no-scope' };
  }
  let ids: number[];
  try {
    const result = await getCharacterSearch(characterId, ['structure'], ANSIBLEX_SEARCH);
    ids = result.data?.structure ?? [];
  } catch {
    return { kind: 'failed' };
  }

  const found = new Map<number, AnsiblexGate>();
  const unknown = new Set<string>();
  for (const structureId of ids) {
    // A structure no character can read (a 403 for each) is left out; the
    // roster fallback in `loadStructureInfo` only reads the name, while who
    // found the gate stays this character, whose search listed it.
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
