import { romanLevel } from '@/engine/projection';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { SkillsPageHeader } from '@/features/skills/SkillsPageHeader';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { SkillCompareDrawer } from '@/features/skills/compare/SkillCompareDrawer';
import { AttributeChips } from '@/features/skills/AttributeChips';
import {
  loadSkillCatalog,
  toAttributeBaseline,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import { acceleratorBonusOf, type AttributeBaseline } from '@/engine/attributeBaseline';
import { loadCharacterAttributes, loadCharacterImplants } from '@/features/skills/data';
import { loadImplantTypeBonuses } from '@/features/skills/typeDetail';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { formatCountdown } from '@/lib/duration';
import { useUrlParam } from '@/lib/useUrlState';
import { textParam } from '@/lib/urlState';
import { filterSkillGroups } from '@/features/skills/skillGroupFilter';
import {
  classifySkillQueue,
  queuedLevelsBySkill,
  type CompletedLevel,
} from '@/engine/skills/queueStatus';
import type { CachedResult } from '@/features/skills/data';
import { skillCsvColumns, skillCsvRows } from '@/features/skills/skillsCsv';
import { boardCsvGroups, buildSkillBoard } from '@/features/skills/skillBoard';
import { GroupTile, SkillBoardRow } from '@/features/skills/SkillBoardView';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CharacterAttributes, CharacterSkills } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';
import { createNumberFormat, formatNumber } from '@/lib/numberLocale';

// Part-trained levels bank fractional SP; the old default printed up to 3 decimals.
const formatSp = createNumberFormat({ maximumFractionDigits: 3 });

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
  const implantBonuses = await loadImplantTypeBonuses(implantIds);
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
    implantBonuses,
    attributeBaseline,
  };
}

const GROUP_SEARCH_PARAM = textParam();
/** Pause before the match count is announced to a screen reader. */
const SEARCH_ANNOUNCE_DEBOUNCE_MS = 250;

/** Every SDE skill for the active character, grouped by SDE group, with SP + attributes. */
export function Skills() {
  const { t } = useTranslation();
  // A retired Compare link (`/skills/compare?ids=…`, see `legacyPaths.ts`) lands here with its
  // selection in the URL: open on it. The drawer clears that selection when it closes.
  const { search } = useLocation();
  const [compareOpen, setCompareOpen] = useState(() => {
    const params = new URLSearchParams(search);
    return params.has('ids') || params.has('comparisonId');
  });
  // Mounted from the first open on, so closing still plays its exit animation.
  const [compareMounted, setCompareMounted] = useState(compareOpen);
  if (compareOpen && !compareMounted) setCompareMounted(true);
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadSkillsSnapshot,
    undefined,
    { cacheKey: 'skills' }
  );

  const catalog = data?.catalog ?? null;
  const skillsResult = data?.skillsResult ?? null;
  const skillsNeedsReauth = data?.skillsNeedsReauth ?? false;
  // The full banner is for a lapsed grant with nothing saved to show; with a
  // saved copy the list stays and a small note sits above it.
  const skillsBlocked = skillsNeedsReauth && !skillsResult;
  const attributesResult = data?.attributesResult ?? null;
  const completedLevels = data?.completedLevels ?? null;
  const queuedLevels = data?.queuedLevels ?? null;
  const training = data?.training ?? null;
  const completedSp = data?.completedSp ?? 0;
  const trainingChip = training && (
    <span className="shrink-0 text-[0.6875rem] whitespace-nowrap text-accent tabular-nums">
      {t('skills.trainingChip', {
        level: romanLevel(training.targetLevel),
        time: formatCountdown(training.secondsRemaining),
      })}
    </span>
  );
  const fetchedAt = data?.fetchedAt ?? null;
  const implantBonuses = data?.implantBonuses ?? {};
  const attributeBaseline = data?.attributeBaseline ?? null;

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

  // Every plan this Character has, merged by skill at the highest level any
  // asks: the bar's planned mark reflects any plan, not just Show info's target.
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
    if (skillsBlocked) return [];
    if (!searching) return skillCsvRows(boardCsvGroups(groups, plannedLevels));
    return skillCsvRows(
      boardCsvGroups(
        groups
          .filter((group) => filterResult.visibleGroupNames.has(group.groupName))
          .map((group) => ({
            ...group,
            skills: filterResult.matchedSkillsByGroup.get(group.groupName) ?? [],
          })),
        plannedLevels
      )
    );
  }, [groups, skillsBlocked, searching, filterResult, plannedLevels]);
  const csvColumns = useMemo(() => skillCsvColumns(t), [t]);
  const skillsExport = useTableExport({
    surface: 'skills',
    rows: csvRows,
    columns: csvColumns,
    source: 'rows',
  });

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-page space-y-4">
      <SkillsPageHeader
        meta={fetchedAt && <DataAgeBadge date={fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Compare />}
              label={t('skillCompare.open')}
              visibleLabel={t('skillCompare.open')}
              onClick={() => setCompareOpen(true)}
            />
            <TableActionsMenu name={t('nav.skills')} tableExport={skillsExport} size="md" />
            <IconButton icon={<Icon.Refresh />} label={t('skills.refresh')} onClick={refresh} />
          </>
        }
      />
      <SkillsSubNav />

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
              ? formatSp(skillsResult.data.total_sp + completedSp)
              : t('common.unknown')
          }
        />
        <StatChip
          label={t('skills.unallocatedSp')}
          value={
            skillsResult?.data?.unallocated_sp !== undefined
              ? formatNumber(skillsResult.data.unallocated_sp)
              : t('common.unknown')
          }
        />
      </StatChips>

      {loading && !data ? (
        <Spinner block="page" label={t('common.loading')} />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : skillsBlocked ? (
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
          {skillsNeedsReauth && (
            <ReauthCachedNote characterId={activeCharacterId} endpoints={['getCharacterSkills']} />
          )}
          {skillsResult.fromCache && <CachedNotice fetchedAt={fetchedAt} />}

          <Panel title={t('skills.attributes')}>
            <AttributeChips
              attributes={attributesResult?.data ?? null}
              implantBonuses={implantBonuses}
              boosterBonus={acceleratorBonusOf(attributeBaseline)}
            />
          </Panel>

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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  <section key={group.groupName} className={expanded ? 'col-span-full' : ''}>
                    <h2>
                      <GroupTile
                        group={group}
                        expanded={expanded}
                        matchCount={searching ? skillsToShow.length : undefined}
                        trailing={groupHasTraining ? trainingChip : null}
                        onToggle={() => toggleGroup(group.groupName)}
                      />
                    </h2>
                    {expanded && (
                      <ul className="mt-1 divide-y divide-line rounded-xs border border-line bg-panel/85 px-3">
                        {skillsToShow.map((skill) => (
                          <SkillBoardRow
                            key={skill.skillTypeID}
                            skill={skill}
                            plannedLevel={plannedLevels.get(skill.skillTypeID) ?? null}
                            trainingChip={
                              training?.skillTypeID === skill.skillTypeID ? trainingChip : null
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      {compareMounted && (
        <SkillCompareDrawer
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          activeCharacterId={activeCharacterId}
        />
      )}
    </div>
  );
}
