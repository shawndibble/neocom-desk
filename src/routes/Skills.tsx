import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
  DataAgeBadge,
  EmptyState,
  PageHeader,
  Panel,
  ReauthBanner,
  SearchInput,
  SkillBar,
  Spinner,
  StatChip,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { AttributeChips } from '@/features/skills/AttributeChips';
import { ImplantChip } from '@/features/skills/ImplantChip';
import { SkillInspector } from '@/features/skills/SkillInspector';
import { SkillRowContextMenu } from '@/features/skills/SkillRowContextMenu';
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
    completedLevels,
    completedSp,
    fetchedAt,
    implantDetails,
    implantBonuses,
    attributeBaseline,
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
  const attributeSlotsFilled = implantDetails.filter((i) => i.attributeSlot).length;
  const implantBonuses = data?.implantBonuses ?? {};
  const attributeBaseline = data?.attributeBaseline ?? null;

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
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('nav.skills')}
        meta={fetchedAt && <DataAgeBadge date={fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Download />}
              label={t('skills.exportCsv')}
              disabled={groups.length === 0 || skillsNeedsReauth}
              onClick={() => downloadCsv('skills', skillCsvRows(groups), skillCsvColumns(t))}
            />
            <IconButton icon={<Icon.Refresh />} label={t('skills.refresh')} onClick={refresh} />
          </>
        }
      />
      <SkillsSubNav />

      <div className="flex flex-wrap items-center gap-2">
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
            <SkillInspector
              skillName={inspector.name}
              description={inspector.description}
              prereqs={inspector.prereqs}
              unlocks={inspector.unlocks}
              onClose={() => setSelectedSkillTypeID(null)}
            />
          )}

          {groups.length > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-bg py-2">
              <SearchInput
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder={t('skills.searchPlaceholder')}
                className="min-w-48 flex-1"
              />
              {/* `md`, not `sm`: these sit on the search box's own line, and the
                  shared control scale is what keeps the three the same height. */}
              <Button onClick={expandAllGroups} disabled={searching}>
                {t('skills.expandAll')}
              </Button>
              <Button onClick={collapseAllGroups} disabled={searching}>
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
                        <Caret expanded={expanded} />
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
                          const progress =
                            skill.sp === null
                              ? null
                              : progressToNextLevel(skill.rank, skill.level, skill.sp);
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
                              <SkillBar level={skill.level} progress={progress} />
                              <span className="w-20 shrink-0 text-right tabular-nums text-text-dim">
                                {skill.sp === null
                                  ? t('common.unknown')
                                  : t('skills.sp', { value: skill.sp.toLocaleString() })}
                              </span>
                            </button>
                          );
                          return (
                            <li key={skill.skillTypeID}>
                              <SkillRowContextMenu
                                activeCharacterId={activeCharacterId}
                                skillTypeID={skill.skillTypeID}
                                currentLevel={skill.level}
                                tooltipContent={skill.description}
                              >
                                {row}
                              </SkillRowContextMenu>
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
