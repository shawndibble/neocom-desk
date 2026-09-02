import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  Panel,
  ReauthBanner,
  SkillBar,
  Spinner,
  StatChip,
  Tooltip,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { ImplantChip } from '@/features/skills/ImplantChip';
import { SkillInspector } from '@/features/skills/SkillInspector';
import { buildSkillRequirements } from '@/features/skills/skillRequirements';
import {
  loadSkillCatalog,
  toTrainedSkillsMap,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import {
  loadCharacterAttributes,
  loadCharacterImplants,
  loadUniverseType,
} from '@/features/skills/data';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { filterSkillGroups } from '@/features/skills/skillGroupFilter';
import type { CompletedLevel } from '@/features/skills/queueStatus';
import type { CachedResult } from '@/features/skills/data';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { extractAttributeBonuses, sumAttributeBonuses } from '@/features/skills/dogma';
import { skillCsvColumns, skillCsvRows, type SkillGroup } from '@/features/skills/skillsCsv';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { downloadCsv } from '@/lib/downloadCsv';
import type { CharacterAttributes, CharacterSkills } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';

const ATTRIBUTE_ORDER = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;

interface ImplantDetail {
  typeId: number;
  name: string;
  description: string | null;
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
  /** SP those credited levels add to ESI's total_sp, which is stale by the same amount. */
  completedSp: number;
  /** Older of /skills' and the queue's fetchedAt — the true freshness of the corrected total. */
  fetchedAt: Date | null;
  implantDetails: ImplantDetail[];
  implantBonuses: Implants;
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
  const { skillsResult, skillsNeedsReauth, completedLevels, completedSp, fetchedAt } = corrected;

  // Already superseded: skip the per-implant type lookups, their results would
  // be discarded.
  const implantIds = signal.cancelled ? [] : (implantsResult?.data ?? []);
  const implantTypes = await Promise.all(implantIds.map((id) => loadUniverseType(id)));
  const implantDetails: ImplantDetail[] = implantIds.map((id, i) => {
    const info = implantTypes[i]?.data;
    return {
      typeId: id,
      name: info?.name ?? `#${id}`,
      description: info?.description ? stripEveMarkup(info.description) : null,
    };
  });
  const implantBonuses = sumAttributeBonuses(
    implantTypes.map((r) => extractAttributeBonuses(r?.data?.dogma_attributes))
  );

  return {
    catalog,
    skillsResult,
    skillsNeedsReauth,
    attributesResult,
    completedLevels,
    completedSp,
    fetchedAt,
    implantDetails,
    implantBonuses,
  };
}

/** Trained skills for the active character: grouped by SDE group, with SP + attributes/implants. */
export function Skills() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadSkillsSnapshot);

  const catalog = data?.catalog ?? null;
  const skillsResult = data?.skillsResult ?? null;
  const skillsNeedsReauth = data?.skillsNeedsReauth ?? false;
  const attributesResult = data?.attributesResult ?? null;
  const completedLevels = data?.completedLevels ?? null;
  const completedSp = data?.completedSp ?? 0;
  const fetchedAt = data?.fetchedAt ?? null;
  const implantDetails = data?.implantDetails ?? [];
  const implantBonuses = data?.implantBonuses ?? {};

  const [selectedSkillTypeID, setSelectedSkillTypeID] = useState<number | null>(null);

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

  const inspector = useMemo(() => {
    if (selectedSkillTypeID === null || !catalog) return null;
    return buildSkillRequirements(catalog, trainedSkillsMap, selectedSkillTypeID);
  }, [selectedSkillTypeID, catalog, trainedSkillsMap]);

  // All groups start collapsed on every load (CONTEXT.md round 17); nothing
  // seeds this set from a previous visit.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [groupSearch, setGroupSearch] = useState('');
  const filterResult = useMemo(() => filterSkillGroups(groups, groupSearch), [groups, groupSearch]);
  // While searching, a surviving group is by construction a match — force it
  // open so the result is visible without the user pre-expanding it. Toggling
  // is a no-op during search so `expandedGroups` stays untouched underneath,
  // and clearing the search restores the prior collapse state exactly (same
  // approach as the Assets tree's search/expand interaction).
  const searching = filterResult !== null;

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

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SkillsSubNav />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && <DataAgeBadge date={fetchedAt} />}
          <IconButton
            icon={<Icon.Download />}
            label={t('skills.exportCsv')}
            disabled={groups.length === 0 || skillsNeedsReauth}
            onClick={() => downloadCsv('skills', skillCsvRows(groups), skillCsvColumns(t))}
          />
          <IconButton icon={<Icon.Refresh />} label={t('skills.refresh')} onClick={refresh} />
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : skillsNeedsReauth ? (
        <ReauthBanner
          title={t('skills.reauthTitle')}
          hint={t('skills.reauthHint')}
          actionLabel={t('skills.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : !skillsResult ? (
        <EmptyState title={t('skills.emptyTitle')} hint={t('skills.emptyHint')} />
      ) : (
        <>
          {skillsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('skills.offlineTitle')}</p>
          )}

          <Panel title={t('skills.attributes')}>
            <div className="flex flex-wrap gap-4">
              {attributesResult?.data ? (
                ATTRIBUTE_ORDER.map((name) => {
                  // ESI attribute values already include implant bonuses.
                  const effective = attributesResult.data![name];
                  const bonus = implantBonuses[name] ?? 0;
                  const base = effective - bonus;
                  return (
                    <StatChip
                      key={name}
                      label={t(`skills.attr.${name}`)}
                      value={
                        bonus ? t('skills.attributeEffective', { base, bonus, effective }) : base
                      }
                      tone={bonus ? 'accent' : 'default'}
                    />
                  );
                })
              ) : (
                <span className="text-xs text-text-dim">{t('common.unknown')}</span>
              )}
            </div>
            <div className="mt-3">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('skills.implants')}
              </p>
              {implantDetails.length > 0 ? (
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
              ) : (
                <p className="mt-1 text-xs text-text-dim">{t('skills.implantsNone')}</p>
              )}
            </div>
          </Panel>

          {inspector && (
            <SkillInspector
              skillName={inspector.name}
              description={inspector.description}
              prereqs={inspector.prereqs}
              unlocks={inspector.unlocks}
              onClose={() => setSelectedSkillTypeID(null)}
            />
          )}

          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder={t('skills.searchPlaceholder')}
                className="h-9 min-w-48 flex-1 rounded-xs border border-line bg-panel-2 px-3 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
              />
              <Button size="sm" onClick={expandAllGroups} disabled={searching}>
                {t('skills.expandAll')}
              </Button>
              <Button size="sm" onClick={collapseAllGroups} disabled={searching}>
                {t('skills.collapseAll')}
              </Button>
            </div>
          )}

          {searching && filterResult.visibleGroupNames.size === 0 ? (
            <EmptyState title={t('skills.noResults')} className="py-8" />
          ) : (
            groups.map((group) => {
              if (searching && !filterResult.visibleGroupNames.has(group.groupName)) return null;
              const expanded = searching || expandedGroups.has(group.groupName);
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
                      className={`flex min-h-8 w-full items-center justify-between gap-2 border-line px-3 py-1 text-left hover:bg-panel-2 disabled:hover:bg-transparent ${
                        expanded ? 'border-b' : ''
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                        <span aria-hidden="true" className="w-3 shrink-0 text-text-faint">
                          {expanded ? '▾' : '▸'}
                        </span>
                        {group.groupName}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-faint">
                        {skillsToShow.length}
                      </span>
                    </button>
                  </h2>
                  {expanded && (
                    <div className="p-3">
                      <ul className="divide-y divide-line">
                        {skillsToShow.map((skill) => {
                          const selected = selectedSkillTypeID === skill.skillTypeID;
                          const row = (
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                setSelectedSkillTypeID((current) =>
                                  current === skill.skillTypeID ? null : skill.skillTypeID
                                )
                              }
                              className={`flex w-full items-center justify-between gap-2 py-1.5 text-left text-xs hover:bg-panel-2 ${
                                selected ? 'bg-panel-2' : ''
                              }`}
                            >
                              <span className="flex-1 truncate">{skill.name}</span>
                              <SkillBar level={skill.level} />
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
            })
          )}
        </>
      )}
    </div>
  );
}
