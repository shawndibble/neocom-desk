/**
 * The Calendar's second corporation read: the corp's skyhook theft windows, as
 * a clock kind of the Character's own (`skyhookRaid`, issue #4784).
 *
 * Gated before it fetches, exactly as `calendarMoonChunks.ts` is: corporation,
 * then roles, then scopes (`resolveCorpReadAccess`), and no corp call at all
 * unless `canReadSkyhooks` passes. `undefined` sources mean "not readable", so
 * a pilot without the role sees the Calendar they had before. The reads are the
 * ones the corp Sovereignty widget makes (`features/corp/sovereignty.ts`), so
 * they share its caches and cost nothing extra when both are open.
 */
import type { StatusResult } from '@/esi/cache';
import type { BoardClockSource } from '@/engine/character/board';
import { parseInstant } from '@/engine/esiInstant';
import { resolveCorpReadAccess } from '@/features/corp/corpReadAccess';
import { loadCorporationSkyhooks, loadSkyhookDetails } from '@/features/corp/sovereignty';
import { planetInfo } from '@/features/overview/widgets/data/spaceLookups';
import { toSkyhookRaidSources, type SkyhookRaid } from './calendarBoardSources';

export interface SkyhookRaidRead {
  /** The skyhook list read, for the view's Data Age and offline marker. */
  result: StatusResult<unknown[]>;
  /** `undefined` when the Character may not read skyhooks, so the kind is not readable. */
  sources: BoardClockSource[] | undefined;
  /** The same skyhooks before a clock was picked, for the detail modal. */
  raids: SkyhookRaid[];
}

const NOT_READABLE: SkyhookRaidRead = {
  result: { cached: null, needsReauth: false },
  sources: undefined,
  raids: [],
};

/** A count that is not a number is unknown, never "0 at risk". */
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

  // Every detail read failing says the reads are down, not that nothing is raidable.
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
