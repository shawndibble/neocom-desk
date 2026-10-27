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
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  clonesNeedsReauth: boolean;
  /** Effective level of Infomorph Synchronizing; 0 when unknown/untrained. */
  infomorphLevel: number;
  /** Implants of the clone the Character is wearing; the Skills > Trained read, now loaded here too. */
  wornImplants: CachedResult<number[]> | null;
  /** The read-implants grant is missing (401/403): a banner above the list, never in place of it. */
  implantsNeedsReauth: boolean;
  /** The active training queue. */
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  /** What the training verdict needs; null when the attribute sheet can't be read. */
  training: CloneTrainingData | null;
  /** The Character's current solar system; null when unresolved (missing grant, offline, uncached). */
  characterSystemId: number | null;
  /** Solar system of each clone location, keyed by `location_id`; null when it can't be resolved. */
  systemIds: Map<number, number | null>;
  /** Name of the Character's current system; null when unresolved. */
  characterSystemName: string | null;
  /** Security status of every system above, keyed by solar system id; absent when unresolved. */
  securities: Map<number, number>;
  implantNames: Map<number, string>;
  /** Absent ids render the bare name. */
  implantDetails: Map<number, ImplantDetail>;
  /** Jump-clone and home-clone location names, keyed by `location_id`. */
  locationNames: Map<number, string>;
  /** Total/unallocated SP for the shared Character-overview header. */
  sp: CharacterSpSummary;
  /** Captured in the loader, not at render: `Date.now()` is impure and React forbids it in render/useMemo. */
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
  // Effective (issue #1236: min of queue-corrected trained and active), not
  // raw trained_skill_level — the cooldown should never read shorter than
  // what the character's clone can actually use right now.
  const infomorphLevel = corrected.effective.get(INFOMORPH_SYNCHRONIZING_SKILL_ID) ?? 0;

  const clones = clonesResult?.data.jump_clones ?? [];
  const homeLocation = clonesResult?.data.home_location;

  // Already superseded: skip the name resolves, their results would be discarded.
  const implantTypeIds = signal.cancelled
    ? []
    : [...new Set([...clones.flatMap((c) => c.implants), ...(wornImplants?.data ?? [])])];
  const [implantNames, implantDetails] = await Promise.all([
    loadTypeNames(implantTypeIds),
    loadImplantDetails(implantTypeIds),
  ]);

  // Ids to resolve for one location type: every jump clone of that type, plus
  // the home clone's location if it happens to be that type too.
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
  // A station comes out of the SDE snapshot rather than ESI (issue #655) — a
  // map lookup per id, nothing worth capping. A structure 403 means outside
  // this character's ACL, not a revoked scope: it renders with an id fallback.
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

  // The verdict needs the worn implants and the queue; either missing is its own one-line state.
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
