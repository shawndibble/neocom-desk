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
import { loadGrantedScopes } from '@/app/grantedScopes';

export type { AnsiblexGateRecord };

const SEARCH_PREFIX = 'search:';

export const ANSIBLEX_SEARCH_ENDPOINTS: readonly EsiEndpointId[] = [
  'getCharacterSearch',
  'getUniverseStructure',
];

function pastedId(gate: AnsiblexGate): string {
  return `paste:${bridgePairKey(gate.fromId, gate.toId)}`;
}

export async function gatesOf(): Promise<AnsiblexGateRecord[]> {
  return db.ansiblexGates.orderBy('id').toArray();
}

export function useAnsiblexGates(): AnsiblexGateRecord[] | undefined {
  return useLiveQuery(gatesOf, []);
}

export type FindGatesOutcome =
  { kind: 'no-scope' } | { kind: 'found'; count: number; unknown: string[] } | { kind: 'failed' };

export async function findGatesWithCharacter(
  characterId: number,
  lookup: SystemLookup
): Promise<FindGatesOutcome> {
  const held = await loadGrantedScopes(characterId);
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
    const structure = await loadStructureInfo(characterId, structureId).catch(() => null);
    if (!structure) continue;
    const read = foundGate(structure, lookup);
    if (read.kind === 'gate') found.set(structureId, read.gate);
    else if (read.kind === 'unknown') for (const name of read.names) unknown.add(name);
  }

  const now = Date.now();
  await db.transaction('rw', db.ansiblexGates, async () => {
    const earlier = await db.ansiblexGates.where('id').startsWith(SEARCH_PREFIX).toArray();
    const listed = new Set(ids);
    for (const record of earlier) {
      const structureId = Number(record.id.slice(SEARCH_PREFIX.length));
      if (listed.has(structureId) || !record.foundBy.includes(characterId)) continue;
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
