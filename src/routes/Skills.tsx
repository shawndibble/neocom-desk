import { useMemo } from 'react';
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
} from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { ImplantChip } from '@/features/skills/ImplantChip';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import {
  loadCharacterAttributes,
  loadCharacterImplants,
  loadCharacterSkillQueue,
  loadCharacterSkillsWithStatus,
  loadUniverseType,
} from '@/features/skills/data';
import {
  completedQueueLevels,
  completedSpGain,
  type CompletedLevel,
} from '@/features/skills/queueStatus';
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
   * to apply these on top; computed here so the render stays free of a clock.
   */
  completedLevels: Map<number, CompletedLevel>;
  /** SP those credited levels add to ESI's total_sp, which is stale by the same amount. */
  completedSp: number;
  implantDetails: ImplantDetail[];
  implantBonuses: Implants;
}

async function loadSkillsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [skillsStatus, attributesResult, implantsResult, queueResult, catalog] = await Promise.all([
    loadCharacterSkillsWithStatus(characterId),
    loadCharacterAttributes(characterId),
    loadCharacterImplants(characterId),
    loadCharacterSkillQueue(characterId),
    loadSkillCatalog(),
  ]);
  const { cached: skillsResult, needsReauth: skillsNeedsReauth } = skillsStatus;
  const completedLevels = completedQueueLevels(queueResult?.data ?? [], Date.now());
  const completedSp = completedSpGain(
    new Map((skillsResult?.data?.skills ?? []).map((s) => [s.skill_id, s.skillpoints_in_skill])),
    completedLevels
  );

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
  const implantDetails = data?.implantDetails ?? [];
  const implantBonuses = data?.implantBonuses ?? {};

  const groups = useMemo<SkillGroup[]>(() => {
    if (!skillsResult?.data || !catalog) return [];
    const byGroup = new Map<string, SkillGroup['skills']>();
    const done = new Map(completedLevels ?? []);
    const add = (skillTypeID: number, level: number, sp: number | null) => {
      const info = catalog.bySkillTypeID.get(skillTypeID);
      const groupName = info?.groupName ?? t('common.unknown');
      const list = byGroup.get(groupName) ?? [];
      list.push({ skillTypeID, name: info?.name ?? `#${skillTypeID}`, level, sp });
      byGroup.set(groupName, list);
    };
    for (const skill of skillsResult.data.skills) {
      // /skills is stale until the character next logs in; a finished queue
      // entry outranks it. Delete as we go so the leftovers below are only
      // the skills /skills does not list at all.
      const finished = done.get(skill.skill_id);
      done.delete(skill.skill_id);
      const beatsEsi = finished !== undefined && finished.level > skill.trained_skill_level;
      add(
        skill.skill_id,
        beatsEsi ? finished.level : skill.trained_skill_level,
        beatsEsi ? (finished.sp ?? skill.skillpoints_in_skill) : skill.skillpoints_in_skill
      );
    }
    // sp stays null rather than 0 when ESI withheld level_end_sp: the level
    // is known, the SP is not, and a literal 0 would read as broken.
    for (const [skillTypeID, finished] of done) add(skillTypeID, finished.level, finished.sp);
    return [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupName, skills]) => ({
        groupName,
        skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [skillsResult, catalog, completedLevels, t]);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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
          {skillsResult?.fetchedAt && <DataAgeBadge date={skillsResult.fetchedAt} />}
          <Button
            size="sm"
            disabled={groups.length === 0 || skillsNeedsReauth}
            onClick={() => downloadCsv('skills', skillCsvRows(groups), skillCsvColumns(t))}
          >
            {t('skills.exportCsv')}
          </Button>
          <Button size="sm" onClick={refresh}>
            {t('skills.refresh')}
          </Button>
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

          {groups.map((group) => (
            <Panel key={group.groupName} title={group.groupName}>
              <ul className="divide-y divide-line">
                {group.skills.map((skill) => (
                  <li
                    key={skill.skillTypeID}
                    className="flex items-center justify-between gap-2 py-1.5 text-xs"
                  >
                    <span className="flex-1 truncate">{skill.name}</span>
                    <SkillBar level={skill.level} />
                    <span className="w-20 shrink-0 text-right tabular-nums text-text-dim">
                      {skill.sp === null
                        ? t('common.unknown')
                        : t('skills.sp', { value: skill.sp.toLocaleString() })}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </>
      )}
    </div>
  );
}
