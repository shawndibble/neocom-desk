import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadSkillCatalog,
  toAttributeBaseline,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import { baselineAttributes, type AttributeBaseline } from '@/engine/attributeBaseline';
import { loadCharacterAttributes, type CachedResult } from '@/features/skills/data';
import { loadImplantBonuses } from '@/features/skills/typeDetail';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { invalidateFreshness } from '@/esi/cache';
import { DEFAULT_ATTRIBUTES } from './planSchedule';
import { remapAvailability, type RemapAvailability } from './remapAvailability';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';
import type { CharacterAttributes, SkillQueueEntry } from '@/esi/endpoints';

export interface PlanEditorData {
  loaded: boolean;
  catalog: SkillCatalog | null;
  catalogFailed: boolean;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  trainedSkillsKnown: boolean;
  attributes: Attributes;
  attributesResult: CachedResult<CharacterAttributes> | null;
  attributeBaseline: AttributeBaseline | null;
  implants: Implants;
  remapInfo: RemapAvailability | null;
  queueEntries: readonly SkillQueueEntry[];
  queueFetchedAt: Date | null;
  totalSp: number | null;
  unallocatedSp: number | null;
  fetchedAt: Date | null;
  fromCache: boolean;
  reload: () => void;
}

export function usePlanEditorData(characterId: number | null): PlanEditorData {
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [trainedSkills, setTrainedSkills] = useState<ReadonlyMap<number, TrainedSkill>>(new Map());
  const [trainedSkillsKnown, setTrainedSkillsKnown] = useState(false);
  const [attributes, setAttributes] = useState<Attributes>(DEFAULT_ATTRIBUTES);
  const [attributesResult, setAttributesResult] =
    useState<CachedResult<CharacterAttributes> | null>(null);
  const [attributeBaseline, setAttributeBaseline] = useState<AttributeBaseline | null>(null);
  const [implants, setImplants] = useState<Implants>({});
  const [remapInfo, setRemapInfo] = useState<RemapAvailability | null>(null);
  const [queueEntries, setQueueEntries] = useState<readonly SkillQueueEntry[]>([]);
  const [queueFetchedAt, setQueueFetchedAt] = useState<Date | null>(null);
  const [totalSp, setTotalSp] = useState<number | null>(null);
  const [unallocatedSp, setUnallocatedSp] = useState<number | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const reload = useCallback(() => {
    invalidateFreshness();
    setReloadCount((n) => n + 1);
  }, []);

  const stateFor = useRef<number | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    if (stateFor.current !== characterId) {
      stateFor.current = characterId;
      setTrainedSkills(new Map());
      setTrainedSkillsKnown(false);
      setAttributes(DEFAULT_ATTRIBUTES);
      setAttributesResult(null);
      setAttributeBaseline(null);
      setImplants({});
      setRemapInfo(null);
      setQueueEntries([]);
      setQueueFetchedAt(null);
      setTotalSp(null);
      setUnallocatedSp(null);
      setFetchedAt(null);
      setFromCache(false);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a retry clears the last failure, not a render-time derivation
    setCatalogFailed(false);
    void (async () => {
      const catalogDone = loadSkillCatalog().then(
        (cat) => {
          if (!cancelled) setCatalog(cat);
          return true;
        },
        () => false
      );
      const [skillsResult, attrsResult, implantsResult] = await Promise.allSettled([
        loadCorrectedSkills(characterId, Date.now()),
        loadCharacterAttributes(characterId),
        loadImplantBonuses(characterId),
      ]);
      const catalogLoaded = await catalogDone;
      if (cancelled) return;
      if (!catalogLoaded) setCatalogFailed(true);
      if (skillsResult.status === 'fulfilled') {
        const corrected = skillsResult.value;
        setTrainedSkills(corrected.trained);
        setTrainedSkillsKnown(corrected.skillsResult !== null);
        setQueueEntries(corrected.queueResult?.data ?? []);
        setQueueFetchedAt(corrected.queueResult?.fetchedAt ?? null);
        setTotalSp(corrected.totalSp);
        setUnallocatedSp(corrected.skillsResult?.data.unallocated_sp ?? null);
        setFetchedAt(corrected.fetchedAt);
        setFromCache(
          (corrected.skillsResult?.fromCache ?? false) ||
            (corrected.queueResult?.fromCache ?? false)
        );
      }
      const attrs = attrsResult.status === 'fulfilled' ? attrsResult.value : undefined;
      const implantBonuses = implantsResult.status === 'fulfilled' ? implantsResult.value : null;
      if (attrs !== undefined) {
        if (attrs?.data && implantBonuses !== null) {
          const baseline = toAttributeBaseline(attrs.data, implantBonuses);
          setAttributeBaseline(baseline);
          setAttributes(baselineAttributes(baseline) ?? DEFAULT_ATTRIBUTES);
        }
        setAttributesResult(attrs);
        setRemapInfo(remapAvailability(attrs?.data ?? null, new Date()));
      }
      if (implantBonuses !== null) setImplants(implantBonuses);
      setLoadedFor(characterId);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, reloadCount]);

  return {
    loaded: characterId !== null && loadedFor === characterId,
    catalog,
    catalogFailed,
    trainedSkills,
    trainedSkillsKnown,
    attributes,
    attributesResult,
    attributeBaseline,
    implants,
    remapInfo,
    queueEntries,
    queueFetchedAt,
    totalSp,
    unallocatedSp,
    fetchedAt,
    fromCache,
    reload,
  };
}
