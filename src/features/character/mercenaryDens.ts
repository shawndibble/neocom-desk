/**
 * Fetch + cache layer for a Character's Mercenary Dens (issue #4791): the den
 * list, one detail read per den, and the tactical operations list with one
 * read per operation. ESI has character routes only, so the Overview widget
 * fans out over every stored Character.
 *
 * Nothing unread is shown as fine: a den whose detail fails stays as an
 * unknown row, an operations read with any gap is unknown rather than "none",
 * and a Character whose reads fail is `failed`, not "needs permission".
 */
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
import { db } from '@/db';

export const DEN_SCOPE = ESI_REGISTRY.getCharacterMercenaryDens.scope;
export const OPERATION_SCOPE = ESI_REGISTRY.getCharacterMercenaryOperations.scope;

export interface MercenaryDenRow extends Den {
  key: string;
  characterId: number;
  characterName: string;
  planetId: number;
  planetName: string | null;
  systemId: number | null;
  /** Null when the den's detail could not be read. */
  infomorphs: number | null;
  developmentLevel: number | null;
  /** 0–100 within the level; null when the detail could not be read. */
  developmentAmount: number | null;
  anarchyAmount: number | null;
  /** The corporation owning the skyhook the den sits on. */
  skyhookOwnerId: number | null;
  /** False when the operations scope or any operation read is missing: unknown, not "none". */
  operationsRead: boolean;
}

export interface MercenaryDensWidgetData {
  rows: MercenaryDenRow[];
  /** Characters holding the den scope whose grant ESI still honours. */
  granted: number[];
  /** Of those, the ones whose den list could not be read (and had no cache). */
  failed: number[];
  /** Jumps from the header Character's Current System, by system id. */
  jumps: Map<number, number>;
  systemNames: Map<number, string>;
  /** Skyhook owner corporation names, by id; an unresolved id is absent. */
  ownerNames: Map<number, string>;
  fetchedAt: Date | null;
}

/**
 * One cached read per id under the fan-out cap. A read that throws or finds
 * nothing maps to null, so the caller can tell "unreadable" from "absent".
 */
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

/** Every open-or-done operation, or null when the list or any one of them could not be read. */
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
    // A failed operations read leaves the column unknown; it never fails the widget.
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

/** Planet name and system for each planet; one that cannot be read keeps its id only. */
async function planetInfo(
  planetIds: readonly number[]
): Promise<Map<number, { name: string; systemId: number }>> {
  const info = new Map<number, { name: string; systemId: number }>();
  await mapWithConcurrencyLimit(planetIds, ESI_FANOUT_CONCURRENCY, async (planetId) => {
    try {
      const data = await loadPlanetInfoRow(planetId);
      if (data) info.set(planetId, { name: data.name, systemId: data.system_id });
    } catch {
      // The row keeps its timers and loses only its name.
    }
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

/** What the alerts and the Calendar read of one den: no names, operations or jumps. */
export interface CharacterDenState {
  denId: number;
  planetId: number;
  /** The reinforcement exit; null when not reinforced or the detail could not be read. */
  reinforcedUntilMs: number | null;
  /** 0–100 within the level; null when the detail could not be read. */
  anarchyAmount: number | null;
  anarchyLevel: number | null;
}

export type CharacterDenStates =
  { status: 'read'; dens: CharacterDenState[]; fetchedAt: Date } | { status: 'reauth' | 'failed' };

/**
 * One Character's dens through the same cached reads as the widget, minus its
 * extras (operations, jumps, names): the poll domain and the Calendar need
 * timers and anarchy only. A thrown read is `failed`, never an empty list.
 */
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

/**
 * Every stored Character's dens. A read that found nothing for anyone and had
 * nothing cached throws, so the widget keeps its last value and offers Retry.
 */
export async function loadMercenaryDensWidget(
  characterId: number
): Promise<MercenaryDensWidgetData> {
  const tokens = await db.tokens.toArray();
  const operationScope = new Set(
    tokens.filter((t) => t.scopes.includes(OPERATION_SCOPE)).map((t) => t.characterId)
  );
  const { entries } = await fanOutAllCharacters<CharacterDens>({
    scope: DEN_SCOPE,
    // A thrown read is that Character's failure, not a skip: it holds the scope.
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
    // A name is a nicety in the modal; a failed lookup leaves the id unnamed.
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

/**
 * One Character's dens as rows, for the Calendar's den clocks: the same reads
 * as the widget, without the other Characters, jumps or owner names. `cached`
 * is null when the list could not be read; `needsReauth` when the token lacks
 * the den scope or ESI refused it.
 */
export async function loadCharacterDenRows(
  characterId: number
): Promise<StatusResult<MercenaryDenRow[]>> {
  const scopes = (await db.tokens.get(characterId))?.scopes ?? [];
  if (!scopes.includes(DEN_SCOPE)) return { cached: null, needsReauth: true };
  const entry = await loadCharacterDens(characterId, '', scopes.includes(OPERATION_SCOPE)).catch(
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
