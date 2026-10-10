import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Caret,
  DataAgeBadge,
  EmptyState,
  Panel,
  SearchInput,
  SkillBar,
  Spinner,
  StatChip,
  StatChips,
  IconButton,
  LiveStatus,
  Tooltip,
} from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { SkillsPageHeader } from '@/features/skills/SkillsPageHeader';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { AttributeChips } from '@/features/skills/AttributeChips';
import { ImplantChip } from '@/features/skills/ImplantChip';
import { SkillInspector } from '@/features/skills/SkillInspector';
import { SkillPlanAdd } from '@/features/skills/SkillPlanAdd';
import { buildSkillRequirements } from '@/features/skills/skillRequirements';
import {
  loadSkillCatalog,
  toAttributeBaseline,
  toTrainedSkillsMap,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import { acceleratorBonusOf, type AttributeBaseline } from '@/engine/attributeBaseline';
import { progressToNextLevel } from '@/engine/sp';
import {
  loadCharacterAttributes,
  loadCharacterImplants,
  loadUniverseType,
} from '@/features/skills/data';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { formatCountdown } from '@/lib/duration';
import { useUrlParam } from '@/lib/useUrlState';
import { textParam } from '@/lib/urlState';
import { filterSkillGroups } from '@/features/skills/skillGroupFilter';
import { classifySkillQueue, type CompletedLevel } from '@/features/skills/queueStatus';
import type { CachedResult } from '@/features/skills/data';
import { stripEveMarkup, typeDescription } from '@/features/skills/typeDisplay';
import { extractAttributeBonuses, sumAttributeBonuses } from '@/features/skills/dogma';
import { skillCsvColumns, skillCsvRows, type SkillGroup } from '@/features/skills/skillsCsv';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CharacterAttributes, CharacterSkills } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';

/** A character has 5 implant slots (game mechanic, not a config value — see `whatIfImplants.ts`'s own "always all five keys"). */
const IMPLANT_SLOTS = 5;

interface ImplantDetail {
  typeId: number;
  name: string;
  description: string | null;
  /**
   * Whether this implant fills one of the 5 attribute-enhancer slots, vs. a
   * skill hardwiring or other implant type (slots 6-10) — ESI's
   * `/characters/{id}/implants` returns every fitted implant undifferentiated
   * by slot, so "N of 5 slots empty" (#405) has to derive slot occupancy from
   * whether the implant carries one of `dogma.ts`'s attribute-bonus
   * attributes, the same signal `implantBonuses` already keys off of.
   */
  attributeSlot: boolean;
}

interface Snapshot {
  catalog: SkillCatalog;
  skillsResult: CachedResult<CharacterSkills> | null;
  /** BUG #3: 401/403 (or a failed token refresh) means "log in again", not "offline". */
  skillsNeedsReauth: boolean;
  attributesResult: CachedResult<CharacterAttributes> | null;
  /**
   * Levels finished in the queue that /skills has not caught up to. ESI says
   * to apply these on top; computed by the corrected-skills loader so the
   * render stays free of a clock.
   */
  completedLevels: Map<number, CompletedLevel>;
  /** The level training right now (queue head, still in the future), or null. Null too when the queue was skipped or is paused. */
  training: { skillTypeID: number; targetLevel: number; secondsRemaining: number } | null;
  /** SP those credited levels add to ESI's total_sp, which is stale by the same amount. */
  completedSp: number;
  /** Older of /skills' and the queue's fetchedAt — the true freshness of the corrected total. */
  fetchedAt: Date | null;
  implantDetails: ImplantDetail[];
  implantBonuses: Implants;
  /** Null when ESI's attributes couldn't be read — nothing to classify. */
  attributeBaseline: AttributeBaseline | null;
}

async function loadSkillsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [corrected, attributesResult, implantsResult, catalog] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now(), { skipQueueWithoutScope: true }),
    loadCharacterAttributes(characterId),
    loadCharacterImplants(characterId),
    loadSkillCatalog(),
  ]);
  const { skillsResult, skillsNeedsReauth, completedLevels, completedSp, fetchedAt, queueResult } =
    corrected;
  // `classifySkillQueue`'s own "training" row, the same one the Characters
  // page reads — not a second definition of "in progress".
  const trainingRow = classifySkillQueue(queueResult?.data ?? [], Date.now()).find(
    (row) => row.status === 'training'
  );
  const training =
    trainingRow && trainingRow.secondsRemaining !== null
      ? {
          skillTypeID: trainingRow.entry.skill_id,
          targetLevel: trainingRow.entry.finished_level,
          secondsRemaining: trainingRow.secondsRemaining,
        }
      : null;

  // Already superseded: skip the per-implant type lookups, their results would
  // be discarded.
  const implantIds = signal.cancelled ? [] : (implantsResult?.data ?? []);
  const implantTypes = await Promise.all(implantIds.map((id) => loadUniverseType(id)));
  const implantDetails: ImplantDetail[] = implantIds.map((id, i) => {
    const info = implantTypes[i]?.data;
    return {
      typeId: id,
      name: info?.name ?? `#${id}`,
      description: typeDescription(info?.description),
      attributeSlot: Object.keys(extractAttributeBonuses(info?.dogma_attributes)).length > 0,
    };
  });
  const implantBonuses = sumAttributeBonuses(
    implantTypes.map((r) => extractAttributeBonuses(r?.data?.dogma_attributes))
  );
  const attributeBaseline = attributesResult?.data
    ? toAttributeBaseline(attributesResult.data, implantBonuses)
    : null;

  return {
    catalog,
    skillsResult,
    skillsNeedsReauth,
    attributesResult,
    training,
    completedLevels,
    completedSp,
    fetchedAt,
    implantDetails,
    implantBonuses,
    attributeBaseline,
  };
}

const GROUP_SEARCH_PARAM = textParam();
/** Pause before the match count is announced to a screen reader. */
const SEARCH_ANNOUNCE_DEBOUNCE_MS = 250;

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Trained skills for the active character: grouped by SDE group, with SP + attributes/implants. */
export function Skills() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadSkillsSnapshot,
    undefined,
    { cacheKey: 'skills' }
  );

  const catalog = data?.catalog ?? null;
  const skillsResult = data?.skillsResult ?? null;
  const skillsNeedsReauth = data?.skillsNeedsReauth ?? false;
  const attributesResult = data?.attributesResult ?? null;
  const completedLevels = data?.completedLevels ?? null;
  const training = data?.training ?? null;
  const completedSp = data?.completedSp ?? 0;
  const trainingChip = training && (
    <span className="shrink-0 text-[0.6875rem] whitespace-nowrap text-accent tabular-nums">
      {t('skills.trainingChip', {
        level: ROMAN[training.targetLevel - 1] ?? training.targetLevel,
        time: formatCountdown(training.secondsRemaining),
      })}
    </span>
  );
  const fetchedAt = data?.fetchedAt ?? null;
  const implantDetails = data?.implantDetails ?? [];
  const attributeSlotsFilled = implantDetails.filter((i) => i.attributeSlot).length;
  const implantBonuses = data?.implantBonuses ?? {};
  const attributeBaseline = data?.attributeBaseline ?? null;

  const [selectedSkillTypeID, setSelectedSkillTypeID] = useState<number | null>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const rowButtons = useRef(new Map<number, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();

  // The inspector renders above the sticky search bar and the row that
  // opened it, so a plain selection change can leave it off-screen.
  useEffect(() => {
    if (selectedSkillTypeID !== null) {
      inspectorRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedSkillTypeID]);

  // Drop the inspector selection when switching characters, without an effect
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [inspectorForCharacter, setInspectorForCharacter] = useState(activeCharacterId);
  if (inspectorForCharacter !== activeCharacterId) {
    setInspectorForCharacter(activeCharacterId);
    setSelectedSkillTypeID(null);
  }

  const groups = useMemo<SkillGroup[]>(() => {
    if (!skillsResult?.data || !catalog) return [];
    const byGroup = new Map<string, SkillGroup['skills']>();
    const done = new Map(completedLevels ?? []);
    const add = (skillTypeID: number, level: number, sp: number | null) => {
      const info = catalog.bySkillTypeID.get(skillTypeID);
      const groupName = info?.groupName ?? t('common.unknown');
      const list = byGroup.get(groupName) ?? [];
      list.push({
        skillTypeID,
        name: info?.name ?? `#${skillTypeID}`,
        level,
        sp,
        description: info?.description ? stripEveMarkup(info.description) : null,
        rank: info?.rank ?? 1,
      });
      byGroup.set(groupName, list);
    };
    for (const skill of skillsResult.data.skills) {
      // Delete as we go, so the leftovers below are only the skills /skills
      // does not list at all.
      const finished = done.get(skill.skill_id);
      done.delete(skill.skill_id);
      const beatsEsi = finished !== undefined && finished.level > skill.trained_skill_level;
      add(
        skill.skill_id,
        beatsEsi ? finished.level : skill.trained_skill_level,
        beatsEsi ? (finished.sp ?? skill.skillpoints_in_skill) : skill.skillpoints_in_skill
      );
    }
    for (const [skillTypeID, finished] of done) add(skillTypeID, finished.level, finished.sp);
    return [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupName, skills]) => ({
        groupName,
        skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [skillsResult, catalog, completedLevels, t]);

  const trainedSkillsMap = useMemo(
    () => toTrainedSkillsMap(skillsResult?.data?.skills ?? []),
    [skillsResult]
  );

  // Every plan this row's own context menu can add into (the inspector's Add
  // targets one chosen plan; the mark reflects any of them), merged by
  // skill at the highest level any of them asks. Drives the bar's planned
  // mark: without it a skill already queued in a plan looks identical to one
  // that isn't (issue: no indicator anywhere a skill can be added to a plan).
  const skillPlans = useLiveQuery(
    () =>
      activeCharacterId === null
        ? []
        : db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );
  const plannedLevels = useMemo(() => {
    const levels = new Map<number, number>();
    for (const plan of skillPlans ?? []) {
      for (const entry of plan.entries) {
        levels.set(
          entry.skillTypeID,
          Math.max(levels.get(entry.skillTypeID) ?? 0, entry.targetLevel)
        );
      }
    }
    return levels;
  }, [skillPlans]);

  const selectedSkill = useMemo(
    () =>
      selectedSkillTypeID === null
        ? null
        : (groups
            .flatMap((group) => group.skills)
            .find((skill) => skill.skillTypeID === selectedSkillTypeID) ?? null),
    [groups, selectedSkillTypeID]
  );

  const inspector = useMemo(() => {
    if (selectedSkillTypeID === null || !catalog) return null;
    return buildSkillRequirements(catalog, trainedSkillsMap, selectedSkillTypeID);
  }, [selectedSkillTypeID, catalog, trainedSkillsMap]);

  // All groups start collapsed on every load (CONTEXT.md round 17); nothing
  // seeds this set from a previous visit.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [groupSearch, setGroupSearch] = useUrlParam('groupSearch', GROUP_SEARCH_PARAM);
  const filterResult = useMemo(() => filterSkillGroups(groups, groupSearch), [groups, groupSearch]);
  // While searching, a surviving group is by construction a match — force it
  // open so the result is visible without the user pre-expanding it. Toggling
  // is a no-op during search so `expandedGroups` stays untouched underneath,
  // and clearing the search restores the prior collapse state exactly (same
  // approach as the Assets tree's search/expand interaction).
  const searching = filterResult !== null;
  const matchCount = filterResult
    ? [...filterResult.matchedSkillsByGroup.values()].reduce(
        (sum, skills) => sum + skills.length,
        0
      )
    : null;
  // Filtering is per keystroke; the announcement waits out a pause so a screen
  // reader is not read every intermediate count.
  const [announcedCount, setAnnouncedCount] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setAnnouncedCount(matchCount), SEARCH_ANNOUNCE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [matchCount]);

  function toggleGroup(groupName: string) {
    if (searching) return;
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }
  function expandAllGroups() {
    if (searching) return;
    setExpandedGroups(new Set(groups.map((group) => group.groupName)));
  }
  function collapseAllGroups() {
    if (searching) return;
    setExpandedGroups(new Set());
  }

  // The skills the list shows, grouped as it shows them: a search narrows the
  // export to its matches, exactly as it narrows the list (collapsing a group
  // is not a filter, so collapsed groups still export). Nothing while the
  // skills scope needs re-auth — the old export button was disabled then too.
  const csvRows = useMemo(() => {
    if (skillsNeedsReauth) return [];
    if (!searching) return skillCsvRows(groups);
    return skillCsvRows(
      groups
        .filter((group) => filterResult.visibleGroupNames.has(group.groupName))
        .map((group) => ({
          ...group,
          skills: filterResult.matchedSkillsByGroup.get(group.groupName) ?? [],
        }))
    );
  }, [groups, skillsNeedsReauth, searching, filterResult]);
  const csvColumns = useMemo(() => skillCsvColumns(t), [t]);
  const skillsExport = useTableExport({
    surface: 'skills',
    rows: csvRows,
    columns: csvColumns,
    source: 'rows',
  });

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkillsPageHeader
        meta={fetchedAt && <DataAgeBadge date={fetchedAt} />}
        actions={
          <>
            <TableActionsMenu name={t('nav.skills')} tableExport={skillsExport} size="md" />
            <IconButton icon={<Icon.Refresh />} label={t('skills.refresh')} onClick={refresh} />
          </>
        }
      />
      <SkillsSubNav />
      <LiveStatus>
        {inspector ? t('skills.inspector.shownAnnouncement', { name: inspector.name }) : null}
      </LiveStatus>

      <StatChips>
        <StatChip
          label={t('skills.totalSp')}
          value={
            skillsResult?.data
              ? (skillsResult.data.total_sp + completedSp).toLocaleString()
              : t('common.unknown')
          }
        />
        <StatChip
          label={t('skills.unallocatedSp')}
          value={
            skillsResult?.data?.unallocated_sp !== undefined
              ? skillsResult.data.unallocated_sp.toLocaleString()
              : t('common.unknown')
          }
        />
      </StatChips>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : skillsNeedsReauth ? (
        <GrantBanner
          characterId={activeCharacterId}
          endpoints={['getCharacterSkills']}
          title={t('skills.reauthTitle')}
          hint={t('skills.reauthHint')}
          actionLabel={t('skills.reauthAction')}
        />
      ) : !skillsResult ? (
        <EmptyState title={t('skills.emptyTitle')} hint={t('skills.emptyHint')} />
      ) : (
        <>
          {skillsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('skills.offlineTitle')}</p>
          )}

          <Panel title={t('skills.attributes')}>
            <AttributeChips
              attributes={attributesResult?.data ?? null}
              implantBonuses={implantBonuses}
              boosterBonus={acceleratorBonusOf(attributeBaseline)}
            />
            <div className="mt-3">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('skills.implants')}
              </p>
              {implantDetails.length > 0 ? (
                <>
                  <ul className="mt-1 flex flex-wrap gap-2 text-xs">
                    {implantDetails.map((implant) => (
                      <li key={implant.typeId}>
                        <ImplantChip
                          typeId={implant.typeId}
                          name={implant.name}
                          description={implant.description}
                        />
                      </li>
                    ))}
                  </ul>
                  {attributeSlotsFilled < IMPLANT_SLOTS && (
                    <p className="mt-1 text-xs text-text-dim">
                      {t('skills.implantsSlotsEmpty', {
                        count: IMPLANT_SLOTS - attributeSlotsFilled,
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-xs text-text-dim">{t('skills.implantsNone')}</p>
              )}
            </div>
          </Panel>

          {inspector && (
            <div ref={inspectorRef}>
              <SkillInspector
                skillName={inspector.name}
                description={inspector.description}
                prereqs={inspector.prereqs}
                unlocks={inspector.unlocks}
                onClose={() => {
                  const opener = selectedSkillTypeID;
                  setSelectedSkillTypeID(null);
                  if (opener !== null) focusAfterCommit(() => rowButtons.current.get(opener));
                }}
                planAction={
                  selectedSkill && (
                    <SkillPlanAdd
                      key={selectedSkill.skillTypeID}
                      characterId={activeCharacterId}
                      skillTypeID={selectedSkill.skillTypeID}
                      skillName={selectedSkill.name}
                      currentLevel={selectedSkill.level}
                    />
                  )
                }
              />
            </div>
          )}

          {groups.length > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-bg py-2">
              <SearchInput
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder={t('skills.searchPlaceholder')}
                className="min-w-48 flex-1"
              />
              <LiveStatus>
                {announcedCount === null
                  ? null
                  : announcedCount === 0
                    ? t('skills.noResults')
                    : t('skills.searchResultCount', { count: announcedCount })}
              </LiveStatus>
              {/* `md`, not `sm`: these sit on the search box's own line, and the
                  shared control scale is what keeps the three the same height. */}
              <IconButton
                icon={<Icon.ExpandAll />}
                label={t('skills.expandAll')}
                onClick={expandAllGroups}
                disabled={searching}
              />
              <IconButton
                icon={<Icon.CollapseAll />}
                label={t('skills.collapseAll')}
                onClick={collapseAllGroups}
                disabled={searching}
              />
            </div>
          )}

          {searching && filterResult.visibleGroupNames.size === 0 ? (
            <EmptyState
              title={t('skills.noResults')}
              hint={t('skills.noResultsHint')}
              className="py-8"
            />
          ) : (
            <>
              {groups.map((group) => {
                if (searching && !filterResult.visibleGroupNames.has(group.groupName)) return null;
                const expanded = searching || expandedGroups.has(group.groupName);
                const groupHasTraining =
                  training !== null &&
                  group.skills.some((skill) => skill.skillTypeID === training.skillTypeID);
                const skillsToShow = searching
                  ? (filterResult.matchedSkillsByGroup.get(group.groupName) ?? [])
                  : group.skills;
                return (
                  <section
                    key={group.groupName}
                    className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm"
                  >
                    <h2>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        disabled={searching}
                        onClick={() => toggleGroup(group.groupName)}
                        className={cx(
                          'flex min-h-11 w-full scroll-mt-14 items-center justify-between gap-2 border-line px-3 py-1 text-left disabled:hover:bg-transparent md:min-h-0',
                          rowInteractiveClassName,
                          focusRingInsetClassName,
                          expanded && 'border-b'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                          <Caret expanded={expanded} />
                          <span className="truncate">{group.groupName}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {groupHasTraining && trainingChip}
                          <span className="text-[0.6875rem] tabular-nums text-text-dim">
                            {skillsToShow.length}
                          </span>
                        </span>
                      </button>
                    </h2>
                    {expanded && (
                      <div className="p-3">
                        <ul className="divide-y divide-line">
                          {skillsToShow.map((skill) => {
                            const selected = selectedSkillTypeID === skill.skillTypeID;
                            const progress =
                              skill.sp === null
                                ? null
                                : progressToNextLevel(skill.rank, skill.level, skill.sp);
                            const row = (
                              <button
                                type="button"
                                ref={(el) => {
                                  if (el) rowButtons.current.set(skill.skillTypeID, el);
                                  else rowButtons.current.delete(skill.skillTypeID);
                                }}
                                aria-pressed={selected}
                                onClick={() =>
                                  setSelectedSkillTypeID((current) =>
                                    current === skill.skillTypeID ? null : skill.skillTypeID
                                  )
                                }
                                className={cx(
                                  tappableRowClassName,
                                  'flex w-full scroll-mt-14 items-center justify-between gap-2 py-1.5 text-left text-xs',
                                  rowInteractiveClassName,
                                  focusRingInsetClassName,
                                  selected
                                    ? selectedRowClassName
                                    : 'border-l-2 border-l-transparent'
                                )}
                              >
                                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                                  <span className="dt-primary line-clamp-2 min-w-0 sm:line-clamp-none sm:flex-1 sm:truncate">
                                    {skill.name}
                                  </span>
                                  {training?.skillTypeID === skill.skillTypeID && trainingChip}
                                </span>
                                <SkillBar
                                  level={skill.level}
                                  progress={progress}
                                  plannedLevel={plannedLevels.get(skill.skillTypeID) ?? null}
                                />
                                <span className="w-20 shrink-0 text-right tabular-nums text-text-dim">
                                  {skill.sp === null
                                    ? t('common.unknown')
                                    : t('skills.sp', { value: skill.sp.toLocaleString() })}
                                </span>
                              </button>
                            );
                            return (
                              <li key={skill.skillTypeID}>
                                {skill.description ? (
                                  <Tooltip content={skill.description} className="w-full">
                                    {row}
                                  </Tooltip>
                                ) : (
                                  row
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
