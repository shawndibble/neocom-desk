import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, Spinner, StatChip } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { SkillBar } from '@/features/skills/SkillBar';
import { ImplantChip } from '@/features/skills/ImplantChip';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import {
  loadCharacterAttributes,
  loadCharacterImplants,
  loadCharacterSkills,
  loadUniverseType,
} from '@/features/skills/data';
import type { CachedResult } from '@/features/skills/data';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import type { CharacterAttributes, CharacterSkills } from '@/esi/endpoints';

const ATTRIBUTE_ORDER = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;

interface SkillGroup {
  groupName: string;
  skills: { skillTypeID: number; name: string; level: number; sp: number }[];
}

interface ImplantDetail {
  typeId: number;
  name: string;
  description: string | null;
}

interface Snapshot {
  requestKey: string;
  catalog: SkillCatalog;
  skillsResult: CachedResult<CharacterSkills> | null;
  attributesResult: CachedResult<CharacterAttributes> | null;
  implantsResult: CachedResult<number[]> | null;
  implantDetails: ImplantDetail[];
}

/** Trained skills for the active character: grouped by SDE group, with SP + attributes/implants. */
export function Skills() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = `${activeCharacterId}:${refreshKey}`;

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;

    void (async () => {
      const [skillsResult, attributesResult, implantsResult, catalog] = await Promise.all([
        loadCharacterSkills(activeCharacterId),
        loadCharacterAttributes(activeCharacterId),
        loadCharacterImplants(activeCharacterId),
        loadSkillCatalog(),
      ]);
      if (cancelled) return;

      const implantIds = implantsResult?.data ?? [];
      const implantTypes = await Promise.all(implantIds.map((id) => loadUniverseType(id)));
      if (cancelled) return;
      const implantDetails: ImplantDetail[] = implantIds.map((id, i) => {
        const info = implantTypes[i]?.data;
        return {
          typeId: id,
          name: info?.name ?? `#${id}`,
          description: info?.description ? stripEveMarkup(info.description) : null,
        };
      });

      setSnapshot({
        requestKey,
        catalog,
        skillsResult,
        attributesResult,
        implantsResult,
        implantDetails,
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from these same deps
  }, [activeCharacterId, refreshKey]);

  // Only trust the snapshot when it answers the current (character, refresh) request.
  const current = snapshot?.requestKey === requestKey ? snapshot : null;
  const { catalog, skillsResult, attributesResult, implantDetails } = current ?? {
    catalog: null,
    skillsResult: undefined,
    attributesResult: undefined,
    implantDetails: [],
  };

  const groups = useMemo<SkillGroup[]>(() => {
    if (!skillsResult?.data || !catalog) return [];
    const byGroup = new Map<string, SkillGroup['skills']>();
    for (const skill of skillsResult.data.skills) {
      const info = catalog.bySkillTypeID.get(skill.skill_id);
      const groupName = info?.groupName ?? t('common.unknown');
      const list = byGroup.get(groupName) ?? [];
      list.push({
        skillTypeID: skill.skill_id,
        name: info?.name ?? `#${skill.skill_id}`,
        level: skill.trained_skill_level,
        sp: skill.skillpoints_in_skill,
      });
      byGroup.set(groupName, list);
    }
    return [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupName, skills]) => ({
        groupName,
        skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [skillsResult, catalog, t]);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const loading = skillsResult === undefined || attributesResult === undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SkillsSubNav />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatChip
            label={t('skills.totalSp')}
            value={
              skillsResult?.data ? skillsResult.data.total_sp.toLocaleString() : t('common.unknown')
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
          <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            {t('skills.refresh')}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : !skillsResult ? (
        <EmptyState title={t('skills.emptyTitle')} hint={t('skills.emptyHint')} />
      ) : (
        <>
          {skillsResult.fromCache && (
            <p className="text-[11px] text-warning uppercase">{t('skills.offlineTitle')}</p>
          )}

          <Panel title={t('skills.attributes')}>
            <div className="flex flex-wrap gap-4">
              {attributesResult?.data ? (
                ATTRIBUTE_ORDER.map((name) => (
                  <StatChip key={name} label={name} value={attributesResult.data![name]} />
                ))
              ) : (
                <span className="text-xs text-text-dim">{t('common.unknown')}</span>
              )}
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
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
              <p className="mt-2 text-[11px] text-text-faint">{t('skills.implantsCaveat')}</p>
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
                      {t('skills.sp', { value: skill.sp.toLocaleString() })}
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
