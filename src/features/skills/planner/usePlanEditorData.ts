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
  /** The first load for this character has finished, successfully or not. */
  loaded: boolean;
  catalog: SkillCatalog | null;
  /** The skill catalog could not be loaded (`loaded` is then true with `catalog` null); `reload` tries again. */
  catalogFailed: boolean;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  /**
   * Whether `trainedSkills` is ESI's answer rather than the empty map that
   * stands in before /skills has ever been read (a fresh device, offline with
   * no cache, or a 401 awaiting re-auth). An empty map is a legitimate answer
   * for a brand-new character, so emptiness cannot be the test — and anything
   * that would *rewrite the plan* against those levels has to know the
   * difference. The catalog is no proxy: it ships in the bundle and loads
   * whether or not ESI answered.
   */
  trainedSkillsKnown: boolean;
  /** Base attributes (implant bonuses removed) — what the scheduler costs against. */
  attributes: Attributes;
  /**
   * ESI's own reading (with its `fetchedAt`, for a `DataAgeBadge`), or null
   * when it could not be read. `attributes` above falls back to
   * DEFAULT_ATTRIBUTES so the scheduler always has numbers to work with;
   * anything *displaying* the character's sheet reads this instead, or it
   * presents that fallback as fact.
   */
  attributesResult: CachedResult<CharacterAttributes> | null;
  /**
   * How `attributes` was arrived at: already a legal allocation, an inflated
   * sheet a cerebral accelerator explains, or one nothing explains. Null until
   * ESI has been read at all — the placeholder sheet above is not a finding
   * about the character, so it must not be reported as one.
   */
  attributeBaseline: AttributeBaseline | null;
  implants: Implants;
  remapInfo: RemapAvailability | null;
  /** The live in-game queue (empty when unread) — it trains before any plan does. */
  queueEntries: readonly SkillQueueEntry[];
  /** When the queue was read, for a `DataAgeBadge`; null when it never was. */
  queueFetchedAt: Date | null;
  /** Queue-corrected total SP (`loadCorrectedSkills`), null until /skills has loaded. */
  totalSp: number | null;
  /** ESI's `unallocated_sp`, null until /skills has loaded or when ESI omits it. */
  unallocatedSp: number | null;
  /**
   * Freshness of `trainedSkills` for a `DataAgeBadge`: the older of the
   * /skills and queue reads (`loadCorrectedSkills`), null until either was read.
   */
  fetchedAt: Date | null;
  /** Either of those two reads is the saved copy: ESI could not be reached. */
  fromCache: boolean;
  /**
   * Re-runs the load, reaching ESI rather than a freshness-window hit (the
   * same bypass as `useRouteSnapshot`'s `refresh`). The previous answer
   * stays in place until the new one lands, so a view can keep its rows on
   * screen while it refreshes.
   */
  reload: () => void;
}

/**
 * Inputs shared by the plan list (Current Queue panel, new-plan remap
 * prefill) and the plan editor, loaded once per active character. Both
 * routes call this rather than one owning it and passing it down, since
 * they're siblings, not parent/child, once plan editing has its own route.
 */
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
  // Remaps Available (GLOSSARY.md): live input to `remapBudget`; `newPlan.ts`
  // also seeds the offline-fallback `remapCount` from it once, at creation.
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

  // The Character the state above belongs to. A switch clears it before the
  // new load, so a failed load for B can never leave A's skills standing as B's.
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
      // Each read lands on its own: offline, one can fail while another is
      // answered from the cache, and the editor should keep what it got.
      // The skill catalog ships in the bundle, so it is set the moment it is
      // in rather than after the ESI reads, which offline can be slow. Views
      // that need the pilot's data too wait for `loaded`, not for the catalog.
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
        // /skills is stale until the character next logs in. ESI says to apply
        // past-finish_date queue entries on top, or a plan gets normalized and
        // optimized against levels the character already trained past.
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
      // Without the implants the baseline can't be worked out; the attributes
      // alone are kept, as ESI reported them.
      const attrs = attrsResult.status === 'fulfilled' ? attrsResult.value : undefined;
      const implantBonuses = implantsResult.status === 'fulfilled' ? implantsResult.value : null;
      if (attrs !== undefined) {
        if (attrs?.data && implantBonuses !== null) {
          // An `impossible` sheet yields no baseline at all, so the scheduler
          // falls back to the same placeholder it uses when ESI cannot be read.
          // Approximating one from the reported numbers is what produced the
          // silent zero this replaces: see engine/attributeBaseline.ts.
          const baseline = toAttributeBaseline(attrs.data, implantBonuses);
          setAttributeBaseline(baseline);
          setAttributes(baselineAttributes(baseline) ?? DEFAULT_ATTRIBUTES);
        }
        setAttributesResult(attrs);
        setRemapInfo(remapAvailability(attrs?.data ?? null, new Date()));
      }
      if (implantBonuses !== null) setImplants(implantBonuses);
      // "Loaded" means this attempt is over, whichever way it went.
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
