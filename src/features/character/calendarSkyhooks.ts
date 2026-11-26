import type { StatusResult } from '@/esi/cache';
import type { BoardClockSource } from '@/engine/character/board';
import { parseInstant } from '@/engine/esiInstant';
import { resolveCorpReadAccess } from '@/features/corp/corpReadAccess';
import { loadCorporationSkyhooks, loadSkyhookDetails } from '@/features/corp/sovereignty';
import { planetInfo } from '@/features/overview/widgets/data/spaceLookups';
import { toSkyhookRaidSources, type SkyhookRaid } from './calendarBoardSources';

export interface SkyhookRaidRead {
  result: StatusResult<unknown[]>;
  sources: BoardClockSource[] | undefined;
  raids: SkyhookRaid[];
}

const NOT_READABLE: SkyhookRaidRead = {
  result: { cached: null, needsReauth: false },
  sources: undefined,
  raids: [],
};

function sumStock(
  reagents: readonly { secured_stock: number; unsecured_stock: number }[] | undefined,
  pick: 'secured_stock' | 'unsecured_stock'
): number | null {
  if (reagents === undefined) return null;
  const total = reagents.reduce((sum, reagent) => sum + reagent[pick], 0);
  return Number.isFinite(total) ? total : null;
}

export async function loadSkyhookRaids(
  characterId: number,
  nowMs: number
): Promise<SkyhookRaidRead> {
  const access = await resolveCorpReadAccess(characterId);
  if (access === null || !access.can('canReadSkyhooks')) return NOT_READABLE;
  const { corporationId } = access;

  const listRead = await loadCorporationSkyhooks(characterId, corporationId);
  const list: StatusResult<unknown[]> = {
    needsReauth: listRead.needsReauth,
    cached: listRead.cached && {
      ...listRead.cached,
      data: listRead.cached.data.skyhooks,
    },
  };
  if (listRead.cached === null) return { result: list, sources: undefined, raids: [] };
  const skyhooks = listRead.cached.data.skyhooks;
  const [details, planets, systems] = await Promise.all([
    loadSkyhookDetails(
      characterId,
      corporationId,
      skyhooks.map((skyhook) => skyhook.id)
    ),
    planetInfo([...new Set(skyhooks.map((skyhook) => skyhook.planet_id))]),
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
  ]);

  const reads = [...details.values()];
  if (reads.length > 0 && reads.every((read) => read.cached === null)) {
    return {
      result: reads.some((read) => read.needsReauth)
        ? { cached: null, needsReauth: true }
        : { cached: null, needsReauth: false },
      sources: undefined,
      raids: [],
    };
  }

  const raids = skyhooks.map((skyhook): SkyhookRaid => {
    const detail = details.get(skyhook.id)?.cached?.data;
    const planet = planets.get(skyhook.planet_id);
    const systemName = planet === undefined ? null : (systems?.get(planet.systemId)?.name ?? null);
    return {
      id: skyhook.id,
      subject: planet?.name ?? systemName ?? `#${skyhook.id}`,
      systemId: planet?.systemId ?? null,
      systemName,
      windowStartMs: parseInstant(detail?.theft_vulnerability?.start),
      windowEndMs: parseInstant(detail?.theft_vulnerability?.end),
      unsecuredUnits: sumStock(detail?.reagents, 'unsecured_stock'),
      securedUnits: sumStock(detail?.reagents, 'secured_stock'),
    };
  });
  return { result: list, sources: toSkyhookRaidSources(raids, nowMs), raids };
}
