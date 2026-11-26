import {
  loadCharacterClones,
  loadImplantDetails,
  type ImplantDetail,
} from '@/features/character/clones';
import { loadCharacterSpSummary } from '@/features/character/characterSp';
import { type CharacterSpSummary } from '@/stores/characterSp';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { resolvePlace } from '@/features/places';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadSystemNameAndSecurity, loadSystemSecurity } from '@/features/character/systemSecurity';
import { loadCharacterImplantsWithStatus } from '@/features/skills/data';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CachedResult } from '@/esi/cache';
import type { CharacterClones, SkillQueueEntry } from '@/esi/endpoints';
import { type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { INFOMORPH_SYNCHRONIZING_SKILL_ID } from '@/engine/clone/cloneJump';
import { loadCloneTrainingData, type CloneTrainingData } from '@/features/character/cloneTraining';

export interface Snapshot {
  clonesResult: CachedResult<CharacterClones> | null;
  clonesNeedsReauth: boolean;
  infomorphLevel: number;
  wornImplants: CachedResult<number[]> | null;
  implantsNeedsReauth: boolean;
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  training: CloneTrainingData | null;
  characterSystemId: number | null;
  systemIds: Map<number, number | null>;
  characterSystemName: string | null;
  securities: Map<number, number>;
  implantNames: Map<number, string>;
  implantDetails: Map<number, ImplantDetail>;
  locationNames: Map<number, string>;
  sp: CharacterSpSummary;
  loadedAt: number;
}

export async function loadClonesSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [
    { cached: clonesResult, needsReauth: clonesNeedsReauth },
    corrected,
    sp,
    { cached: wornImplants, needsReauth: implantsNeedsReauth },
    characterSystemId,
  ] = await Promise.all([
    loadCharacterClones(characterId),
    loadCorrectedSkills(characterId, Date.now(), { skipQueueWithoutScope: true }),
    loadCharacterSpSummary(characterId, Date.now()),
    loadCharacterImplantsWithStatus(characterId),
    loadCharacterSolarSystemId(characterId),
  ]);
  const loadedAt = Date.now();
  const infomorphLevel = corrected.effective.get(INFOMORPH_SYNCHRONIZING_SKILL_ID) ?? 0;

  const clones = clonesResult?.data.jump_clones ?? [];
  const homeLocation = clonesResult?.data.home_location;

  const implantTypeIds = signal.cancelled
    ? []
    : [...new Set([...clones.flatMap((c) => c.implants), ...(wornImplants?.data ?? [])])];
  const [implantNames, implantDetails] = await Promise.all([
    loadTypeNames(implantTypeIds),
    loadImplantDetails(implantTypeIds),
  ]);

  function idsForType(type: 'station' | 'structure'): number[] {
    if (signal.cancelled) return [];
    return [
      ...new Set([
        ...clones.filter((c) => c.location_type === type).map((c) => c.location_id),
        ...(homeLocation?.location_type === type && homeLocation.location_id !== undefined
          ? [homeLocation.location_id]
          : []),
      ]),
    ];
  }
  const stationIds = idsForType('station');
  const structureIds = idsForType('structure');
  const places = await Promise.all(
    [
      ...stationIds.map((id) => ({ locationId: id, characterId, kind: 'station' as const })),
      ...structureIds.map((id) => ({ locationId: id, characterId, kind: 'structure' as const })),
    ].map(async (ref) => ({ ref, place: await resolvePlace(ref) }))
  );
  const systemIds = new Map<number, number | null>();
  const locationNames = new Map<number, string>();
  for (const { ref, place } of places) {
    systemIds.set(ref.locationId, place.systemId);
    if (place.name) locationNames.set(ref.locationId, place.name);
  }
  const securityIds = signal.cancelled
    ? []
    : [
        ...new Set(
          [...systemIds.values(), characterSystemId].filter((id): id is number => id !== null)
        ),
      ];
  const [characterSystem, securityList] = await Promise.all([
    characterSystemId === null || signal.cancelled
      ? null
      : loadSystemNameAndSecurity(characterSystemId),
    Promise.all(securityIds.map((id) => loadSystemSecurity(id))),
  ]);
  const securities = new Map<number, number>();
  securityIds.forEach((id, i) => {
    const security = securityList[i];
    if (security !== null && security !== undefined) securities.set(id, security);
  });

  const training =
    corrected.queueResult && wornImplants && !signal.cancelled
      ? await loadCloneTrainingData(characterId, loadedAt, {
          jumpClones: clones,
          wornImplantIds: wornImplants.data,
          queue: corrected.queueResult.data,
        }).catch(() => null)
      : null;

  return {
    clonesResult,
    clonesNeedsReauth,
    infomorphLevel,
    wornImplants,
    implantsNeedsReauth,
    queueResult: corrected.queueResult,
    training,
    characterSystemId,
    systemIds,
    characterSystemName: characterSystem?.name ?? null,
    securities,
    implantNames,
    implantDetails,
    locationNames,
    sp,
    loadedAt,
  };
}
