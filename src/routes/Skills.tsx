import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  DataAgeBadge,
  EmptyState,
  Panel,
  SearchInput,
  Spinner,
  StatChip,
  StatChips,
  IconButton,
  LiveStatus,
} from '@/components/ui';
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
import {
  classifySkillQueue,
  queuedLevelsBySkill,
  type CompletedLevel,
} from '@/features/skills/queueStatus';
import type { CachedResult } from '@/features/skills/data';
import { typeDescription } from '@/features/skills/typeDisplay';
import { extractAttributeBonuses, sumAttributeBonuses } from '@/features/skills/dogma';
import { skillCsvColumns, skillCsvRows } from '@/features/skills/skillsCsv';
import { boardCsvGroups, buildSkillBoard } from '@/features/skills/skillBoard';
import { GroupTile, SkillBoardRow } from '@/features/skills/SkillBoardView';
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
  /** Highest level each skill still has waiting in the queue, for the board's queued pips. */
  queuedLevels: Map<number, number>;
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

  const queuedLevels = queuedLevelsBySkill(queueResult?.data ?? [], Date.now());

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
    queuedLevels,
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
  const queuedLevels = data?.queuedLevels ?? null;
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

  // Every SDE skill, grouped, with the character's corrected level, queued
  // level and whether the book is still missing (#3643).
  const groups = useMemo(() => {
    if (!skillsResult?.data || !catalog) return [];
    const trained = new Map<number, { level: number; sp: number | null }>();
    const done = new Map(completedLevels ?? []);
    for (const skill of skillsResult.data.skills) {
      // Delete as we go, so the leftovers below are only the skills /skills
      // does not list at all.
      const finished = done.get(skill.skill_id);
      done.delete(skill.skill_id);
      const beatsEsi = finished !== undefined && finished.level > skill.trained_skill_level;
      trained.set(skill.skill_id, {
        level: beatsEsi ? finished.level : skill.trained_skill_level,
        sp: beatsEsi ? (finished.sp ?? skill.skillpoints_in_skill) : skill.skillpoints_in_skill,
      });
    }
    for (const [skillTypeID, finished] of done) {
      trained.set(skillTypeID, { level: finished.level, sp: finished.sp });
    }
    return buildSkillBoard({
      catalog: [...catalog.bySkillTypeID.values()],
      trained,
      queuedLevels: queuedLevels ?? new Map(),
      unknownGroupName: t('common.unknown'),
    });
  }, [skillsResult, catalog, completedLevels, queuedLevels, t]);
  const trainedCount = groups.reduce((sum, group) => sum + group.trained, 0);
  const totalCount = groups.reduce((sum, group) => sum + group.total, 0);
  const queuedCount = groups.reduce((sum, group) => sum + group.queued, 0);

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

  // All groups start collapsed on every load (GLOSSARY.md round 17); nothing
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
    if (!searching) return skillCsvRows(boardCsvGroups(groups));
    return skillCsvRows(
      boardCsvGroups(
        groups
          .filter((group) => filterResult.visibleGroupNames.has(group.groupName))
          .map((group) => ({
            ...group,
            skills: filterResult.matchedSkillsByGroup.get(group.groupName) ?? [],
          }))
      )
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
        {totalCount > 0 && (
          <StatChip
            label={t('skills.board.summaryTrained')}
            value={t('skills.board.trainedOfTotal', { trained: trainedCount, total: totalCount })}
          />
        )}
        {queuedCount > 0 && (
          <StatChip label={t('skills.board.summaryQueued')} value={String(queuedCount)} />
        )}
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
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => {
                  if (searching && !filterResult.visibleGroupNames.has(group.groupName))
                    return null;
                  const expanded = searching || expandedGroups.has(group.groupName);
                  const groupHasTraining =
                    training !== null &&
                    group.skills.some((skill) => skill.skillTypeID === training.skillTypeID);
                  const skillsToShow = searching
                    ? (filterResult.matchedSkillsByGroup.get(group.groupName) ?? [])
                    : group.skills;
                  const listId = `skills-group-${group.groupName.replace(/\W+/g, '-')}`;
                  return (
                    <section key={group.groupName} className={expanded ? 'col-span-full' : ''}>
                      <h2>
                        <GroupTile
                          group={group}
                          expanded={expanded}
                          matchCount={searching ? skillsToShow.length : undefined}
                          trailing={groupHasTraining ? trainingChip : null}
                          controlsId={listId}
                          onToggle={() => toggleGroup(group.groupName)}
                        />
                      </h2>
                      {expanded && (
                        <ul
                          id={listId}
                          className="mt-1 divide-y divide-line rounded-xs border border-line bg-panel/85 px-3"
                        >
                          {skillsToShow.map((skill) => (
                            <SkillBoardRow
                              key={skill.skillTypeID}
                              skill={skill}
                              selected={selectedSkillTypeID === skill.skillTypeID}
                              plannedLevel={plannedLevels.get(skill.skillTypeID) ?? null}
                              trainingChip={
                                training?.skillTypeID === skill.skillTypeID ? trainingChip : null
                              }
                              buttonRef={(el) => {
                                if (el) rowButtons.current.set(skill.skillTypeID, el);
                                else rowButtons.current.delete(skill.skillTypeID);
                              }}
                              onSelect={() =>
                                setSelectedSkillTypeID((current) =>
                                  current === skill.skillTypeID ? null : skill.skillTypeID
                                )
                              }
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
