import {
  conditionalFetch,
  loadWithCacheStatus,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import type { EsiResult } from '@/esi/client';
import {
  getCharacterMercenaryDen,
  getCharacterMercenaryDens,
  getCharacterMercenaryOperation,
  getCharacterMercenaryOperations,
  type CharacterMercenaryDen,
  type CharacterMercenaryOperation,
} from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';
import { parseInstant } from '@/engine/esiInstant';
import { denState, levelNumber, operationState, type Den } from '@/engine/character/mercenaryDens';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import { resolveNames } from '@/features/character/names';
import { loadPlanetInfoRow } from '@/features/pi/names';
import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadGrantedScopes, loadGrantedScopesByCharacter } from '@/app/grantedScopes';

export const DEN_SCOPE = ESI_REGISTRY.getCharacterMercenaryDens.scope;
export const OPERATION_SCOPE = ESI_REGISTRY.getCharacterMercenaryOperations.scope;

export interface MercenaryDenRow extends Den {
  key: string;
  characterId: number;
  characterName: string;
  planetId: number;
  planetName: string | null;
  systemId: number | null;
  infomorphs: number | null;
  developmentLevel: number | null;
  developmentAmount: number | null;
  anarchyAmount: number | null;
  skyhookOwnerId: number | null;
  operationsRead: boolean;
}

export interface MercenaryDensWidgetData {
  rows: MercenaryDenRow[];
  granted: number[];
  failed: number[];
  jumps: Map<number, number>;
  systemNames: Map<number, string>;
  ownerNames: Map<number, string>;
  fetchedAt: Date | null;
}

async function loadEach<Id extends number | string, T>(
  characterId: number,
  ids: readonly Id[],
  key: (id: Id) => string,
  fetchOne: (id: Id, options: { etag?: string }) => Promise<EsiResult<T>>
): Promise<Map<Id, CachedResult<T> | null>> {
  const results = new Map<Id, CachedResult<T> | null>();
  await mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
    const { fetchLive, conditional } = conditionalFetch((options) => fetchOne(id, options));
    try {
      results.set(
        id,
        (await loadWithCacheStatus(characterId, key(id), fetchLive, { conditional })).cached
      );
    } catch {
      results.set(id, null);
    }
  });
  return results;
}

async function loadOperations(characterId: number): Promise<CharacterMercenaryOperation[] | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMercenaryOperations(characterId, options)
  );
  try {
    const list = await loadWithCacheStatus(characterId, 'mercenaryOperations', fetchLive, {
      conditional,
      reportFetchFailure: true,
      authFailureEndpoint: 'getCharacterMercenaryOperations',
    });
    if (list.cached === null) return null;
    const details = await loadEach(
      characterId,
      list.cached.data.operations.map((op) => op.id),
      (id) => `mercenaryOperation:${id}`,
      (id, options) => getCharacterMercenaryOperation(characterId, id, options)
    );
    const reads = [...details.values()];
    const operations = reads.flatMap((op) => (op ? [op.data] : []));
    return operations.length === reads.length ? operations : null;
  } catch {
    return null;
  }
}

interface DenRead {
  id: number;
  planetId: number;
  detail: CharacterMercenaryDen | null;
}

type CharacterDens =
  | { characterId: number; characterName: string; status: 'reauth' | 'failed' }
  | {
      characterId: number;
      characterName: string;
      status: 'read';
      dens: DenRead[];
      operations: CharacterMercenaryOperation[] | null;
      reads: CachedResult<unknown>[];
    };

async function loadCharacterDens(
  characterId: number,
  characterName: string,
  operationsGranted: boolean
): Promise<CharacterDens> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMercenaryDens(characterId, options)
  );
  const list = await loadWithCacheStatus(characterId, 'mercenaryDens', fetchLive, {
    conditional,
    reportFetchFailure: true,
    authFailureEndpoint: 'getCharacterMercenaryDens',
  });
  if (list.cached === null) {
    return { characterId, characterName, status: list.needsReauth ? 'reauth' : 'failed' };
  }
  const listed = list.cached.data.mercenary_dens;
  const [details, operations] = await Promise.all([
    loadEach(
      characterId,
      listed.map((den) => den.id),
      (id) => `mercenaryDen:${id}`,
      (id, options) => getCharacterMercenaryDen(characterId, id, options)
    ),
    operationsGranted ? loadOperations(characterId) : Promise.resolve(null),
  ]);
  const reads: CachedResult<unknown>[] = [list.cached];
  const dens = listed.map(({ id, planet_id }): DenRead => {
    const cached = details.get(id) ?? null;
    if (cached) reads.push(cached);
    return { id, planetId: planet_id, detail: cached?.data ?? null };
  });
  return { characterId, characterName, status: 'read', dens, operations, reads };
}

async function planetInfo(
  planetIds: readonly number[]
): Promise<Map<number, { name: string; systemId: number }>> {
  const info = new Map<number, { name: string; systemId: number }>();
  await mapWithConcurrencyLimit(planetIds, ESI_FANOUT_CONCURRENCY, async (planetId) => {
    try {
      const data = await loadPlanetInfoRow(planetId);
      if (data) info.set(planetId, { name: data.name, systemId: data.system_id });
    } catch {}
  });
  return info;
}

function toRow(
  entry: Extract<CharacterDens, { status: 'read' }>,
  den: DenRead,
  planets: Map<number, { name: string; systemId: number }>
): MercenaryDenRow {
  const { detail } = den;
  const reinforcedUntilMs = parseInstant(detail?.reinforcement_timer?.end);
  const planet = planets.get(den.planetId);
  return {
    key: `${entry.characterId}:${den.id}`,
    id: den.id,
    characterId: entry.characterId,
    characterName: entry.characterName,
    planetId: den.planetId,
    planetName: planet?.name ?? null,
    systemId: planet?.systemId ?? null,
    state: detail ? denState(detail.state, reinforcedUntilMs !== null) : 'unknown',
    reinforcedUntilMs,
    anarchyLevel: detail ? levelNumber(detail.evolution.anarchy.level) : null,
    developmentLevel: detail ? levelNumber(detail.evolution.development.level) : null,
    developmentAmount: detail?.evolution.development.amount ?? null,
    anarchyAmount: detail?.evolution.anarchy.amount ?? null,
    skyhookOwnerId: detail?.skyhook.corporation_id ?? null,
    infomorphs: detail?.infomorphs.amount ?? null,
    operations: (entry.operations ?? [])
      .filter((op) => op.mercenary_den_id === den.id)
      .map((op) => ({ state: operationState(op.state), expiresMs: parseInstant(op.expires) })),
    operationsRead: entry.operations !== null,
  };
}

export interface CharacterDenState {
  denId: number;
  planetId: number;
  reinforcedUntilMs: number | null;
  anarchyAmount: number | null;
  anarchyLevel: number | null;
}

export type CharacterDenStates =
  { status: 'read'; dens: CharacterDenState[]; fetchedAt: Date } | { status: 'reauth' | 'failed' };

export async function loadCharacterDenStates(characterId: number): Promise<CharacterDenStates> {
  try {
    const entry = await loadCharacterDens(characterId, '', false);
    if (entry.status !== 'read') return { status: entry.status };
    return {
      status: 'read',
      fetchedAt: new Date(Math.min(...entry.reads.map((r) => r.fetchedAt.getTime()))),
      dens: entry.dens.map(({ id, planetId, detail }) => ({
        denId: id,
        planetId,
        reinforcedUntilMs: parseInstant(detail?.reinforcement_timer?.end),
        anarchyAmount: detail?.evolution.anarchy.amount ?? null,
        anarchyLevel: detail ? levelNumber(detail.evolution.anarchy.level) : null,
      })),
    };
  } catch {
    return { status: 'failed' };
  }
}

export async function loadMercenaryDensWidget(
  characterId: number
): Promise<MercenaryDensWidgetData> {
  const operationScope = new Set(
    [...(await loadGrantedScopesByCharacter())]
      .filter(([, scopes]) => scopes.has(OPERATION_SCOPE))
      .map(([id]) => id)
  );
  const { entries } = await fanOutAllCharacters<CharacterDens>({
    scope: DEN_SCOPE,
    load: ({ characterId: id, name }) =>
      loadCharacterDens(id, name, operationScope.has(id)).catch(() => ({
        characterId: id,
        characterName: name,
        status: 'failed' as const,
      })),
  });
  const read = entries.filter(
    (entry): entry is Extract<CharacterDens, { status: 'read' }> => entry.status === 'read'
  );
  const failed = entries.filter((entry) => entry.status === 'failed').map((e) => e.characterId);
  if (read.length === 0 && failed.length > 0) throw new Error('Mercenary dens could not be read');

  const planets = await planetInfo([
    ...new Set(read.flatMap((entry) => entry.dens.map((den) => den.planetId))),
  ]);
  const rows = read.flatMap((entry) => entry.dens.map((den) => toRow(entry, den, planets)));
  const systemIds = [
    ...new Set(rows.flatMap((row) => (row.systemId === null ? [] : [row.systemId]))),
  ];
  const stamps = read.flatMap((entry) => entry.reads.map((r) => r.fetchedAt.getTime()));
  const ownerIds = [
    ...new Set(rows.flatMap((row) => (row.skyhookOwnerId === null ? [] : [row.skyhookOwnerId]))),
  ];
  const [jumps, systems, ownerNames] = await Promise.all([
    jumpsFromCurrent(characterId, systemIds),
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
    resolveNames(ownerIds).catch(() => new Map<number, string>()),
  ]);
  const systemNames = new Map<number, string>();
  for (const systemId of systemIds) {
    const name = systems?.get(systemId)?.name;
    if (name !== undefined) systemNames.set(systemId, name);
  }
  return {
    rows,
    granted: entries.filter((entry) => entry.status !== 'reauth').map((e) => e.characterId),
    failed,
    jumps,
    systemNames,
    ownerNames,
    fetchedAt: stamps.length === 0 ? null : new Date(Math.min(...stamps)),
  };
}

export async function loadCharacterDenRows(
  characterId: number
): Promise<StatusResult<MercenaryDenRow[]>> {
  const scopes = await loadGrantedScopes(characterId);
  if (!scopes.has(DEN_SCOPE)) return { cached: null, needsReauth: false };
  const entry = await loadCharacterDens(characterId, '', scopes.has(OPERATION_SCOPE)).catch(
    () => null
  );
  if (entry === null || entry.status !== 'read') {
    return { cached: null, needsReauth: entry?.status === 'reauth' };
  }
  const planets = await planetInfo([...new Set(entry.dens.map((den) => den.planetId))]);
  const oldest = Math.min(...entry.reads.map((read) => read.fetchedAt.getTime()));
  return {
    cached: {
      data: entry.dens.map((den) => toRow(entry, den, planets)),
      fetchedAt: new Date(oldest),
      fromCache: entry.reads.some((read) => read.fromCache),
      truncated: false,
    },
    needsReauth: false,
  };
}
