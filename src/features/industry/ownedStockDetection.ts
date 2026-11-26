import {
  consumedByJobs,
  type JobConsumption,
  type StockJob,
} from '@/engine/industry/jobConsumedStock';
import { ME_MAX } from '@/engine/industry/efficiency';
import type { OwnedStockPlacement, OwnedStockSource } from '@/engine/industry/ownedStock';
import { EMPTY_RIG_FIT, FACILITY_PRESETS, type FacilityContext } from '@/engine/industry/types';
import { loadAllCharactersIndustryJobs } from './jobs';
import { loadCharacterBlueprints } from './data';
import { loadBlueprintCatalog, toIndustryBlueprint } from './blueprintCatalog';
import { loadAllCharactersAssets } from '@/features/assets/assets';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadSystemName } from '@/features/character/systemSecurity';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { Translate } from '@/lib/translate';

export interface OwnedStockSnapshot {
  sources: OwnedStockSource[];
  characterNames: Map<number, string>;
  incompleteCharacters: string[];
  jobConsumption?: JobConsumption[];
}

export const EMPTY_OWNED_STOCK_SNAPSHOT: OwnedStockSnapshot = {
  sources: [],
  characterNames: new Map(),
  incompleteCharacters: [],
  jobConsumption: [],
};

export async function loadOwnedStockSnapshot(): Promise<OwnedStockSnapshot> {
  const { entries, skipped } = await loadAllCharactersAssets();
  const characterNames = new Map<number, string>();
  const sources: OwnedStockSource[] = entries.map((entry) => {
    characterNames.set(entry.characterId, entry.name);
    return { characterId: entry.characterId, assets: entry.assets };
  });
  const incompleteCharacters = [
    ...entries.filter((entry) => entry.truncated).map((entry) => entry.name),
    ...skipped.map((character) => character.name),
  ].sort((a, b) => a.localeCompare(b));
  const snapshotMsByCharacter = new Map<number, number>();
  for (const entry of entries) {
    if (entry.fetchedAt) snapshotMsByCharacter.set(entry.characterId, entry.fetchedAt.getTime());
  }
  const jobConsumption = await loadJobConsumption(snapshotMsByCharacter);
  return { sources, characterNames, incompleteCharacters, jobConsumption };
}

const NEUTRAL_FACILITY: FacilityContext = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: EMPTY_RIG_FIT,
  security: 'highsec',
};

async function loadJobConsumption(
  snapshotMsByCharacter: ReadonlyMap<number, number>
): Promise<JobConsumption[]> {
  if (snapshotMsByCharacter.size === 0) return [];
  try {
    const [{ entries }, catalog] = await Promise.all([
      loadAllCharactersIndustryJobs(),
      loadBlueprintCatalog(),
    ]);
    const stockJobs: StockJob[] = [];
    for (const entry of entries) {
      const snapshotMs = snapshotMsByCharacter.get(entry.characterId);
      const fresh = (entry.result.cached?.data ?? []).filter(
        (job) => snapshotMs !== undefined && Date.parse(job.start_date) > snapshotMs
      );
      if (fresh.length === 0) continue;
      const blueprints = (await loadCharacterBlueprints(entry.characterId)).cached?.data ?? [];
      const meByItem = new Map(blueprints.map((b) => [b.item_id, b.material_efficiency]));
      for (const job of fresh) {
        const knownMe = job.blueprint_id === undefined ? undefined : meByItem.get(job.blueprint_id);
        stockJobs.push({
          jobId: job.job_id,
          characterId: entry.characterId,
          activityId: job.activity_id,
          blueprintTypeId: job.blueprint_type_id,
          runs: job.runs,
          startMs: Date.parse(job.start_date),
          facilityId: job.facility_id,
          me: knownMe ?? ME_MAX,
        });
      }
    }
    return consumedByJobs(
      stockJobs,
      snapshotMsByCharacter,
      (id) => {
        const entry = catalog.byBlueprintTypeID.get(id);
        return entry ? toIndustryBlueprint(entry.blueprint) : undefined;
      },
      NEUTRAL_FACILITY
    );
  } catch {
    return [];
  }
}

async function safeName(load: () => Promise<string | null>): Promise<string | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

export async function resolveStockLocationNames(
  placements: readonly OwnedStockPlacement[]
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const stationIds = new Set<number>();
  const systemIds = new Set<number>();
  const structureIdsByCharacter = new Map<number, Set<number>>();

  for (const placement of placements) {
    if (placement.locationType === 'station') {
      stationIds.add(placement.locationId);
    } else if (placement.locationType === 'solar_system') {
      systemIds.add(placement.locationId);
    } else {
      let ids = structureIdsByCharacter.get(placement.characterId);
      if (!ids) {
        ids = new Set();
        structureIdsByCharacter.set(placement.characterId, ids);
      }
      ids.add(placement.locationId);
    }
  }

  const record = (id: number, name: string | null) => {
    if (name) names.set(id, name);
  };

  await Promise.all([
    ...[...stationIds].map(async (id) => record(id, await safeName(() => loadStationName(id)))),
    ...[...systemIds].map(async (id) => record(id, await safeName(() => loadSystemName(id)))),
    mapWithConcurrencyLimit(
      [...structureIdsByCharacter],
      ESI_FANOUT_CONCURRENCY,
      async ([characterId, ids]) => {
        await Promise.all(
          [...ids].map(async (id) =>
            record(id, await safeName(() => loadStructureName(characterId, id)))
          )
        );
      }
    ),
  ]);

  return names;
}

export function stockLocationLabel(
  placement: Pick<OwnedStockPlacement, 'locationId' | 'locationType'>,
  names: ReadonlyMap<number, string>,
  t: Translate
): string {
  const name = names.get(placement.locationId);
  if (placement.locationType === 'station') {
    return name ?? t('assets.stationLabel', { id: placement.locationId });
  }
  if (placement.locationType === 'solar_system') {
    return name
      ? t('assets.inSpaceNamedLabel', { name })
      : t('assets.inSpaceLabel', { id: placement.locationId });
  }
  return name ?? t('assets.structureLabel', { id: placement.locationId });
}

export interface OwnedStockDetection {
  scopedQuantityFor: (typeID: number) => number;
  lowerBound: boolean;
  incompleteCharacters: readonly string[];
  characterNameFor: (characterId: number) => string;
  corporationNameFor: (corporationId: number) => string;
  locationLabelFor: (placement: Pick<OwnedStockPlacement, 'locationId' | 'locationType'>) => string;
  reducedFor?: (typeID: number) => JobReduction | null;
}

export interface JobReduction {
  quantity: number;
  blueprintNames: readonly string[];
}
