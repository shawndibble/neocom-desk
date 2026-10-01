/**
 * Projected effects: saved Fittings whose running command bursts and remote
 * modules land on the open one — a booster's bursts, a logistics wing's
 * reps, a tackler's web — as many ships of each as the pilot says. Each is
 * worked out once, when added, at all skills V on the implants it carries;
 * then every number on the page takes it in (`useStatsConditions`). A
 * question asked of the fit, like the weather: not saved, not in a link.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { applyImplantBasis, defaultImplantBasis } from '@/engine/fittings/implantBasis';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import { projectsNothing } from '@/engine/fittings/projection';
import type { Fitting } from '@/engine/fittings/types';
import { loadSkills } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { computeOutgoing } from './dogmaFittingEngine';
import { StatNote, StatRowContent, StatRows } from './StatFacts';
import { statRowClassName } from './statKit';
import { useProjectedSources, type ProjectedSource } from './statsConditions';
import { useFittingChoices } from './useFittingChoices';

const MAX_SHIPS = 20;

/** What one ship of a Fitting projects, at all skills V. */
async function projectionOf(id: string, name: string, fitting: Fitting): Promise<ProjectedSource> {
  const allV = buildAllVProfile((await loadSkills()).map((skill) => skill.typeID));
  const pilot = applyImplantBasis(allV, fitting.implantSet, defaultImplantBasis(fitting));
  return {
    id,
    name,
    count: 1,
    projection: await computeOutgoing(fitting, pilot),
  };
}

export function ProjectedEffectsPanel() {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const sources = useProjectedSources((state) => state.sources);
  const setSources = useProjectedSources((state) => state.setSources);
  const [failed, setFailed] = useState<string | null>(null);
  const choices = useFittingChoices(characterId);
  const isFree = (choice: { id: string }) => !sources.some((source) => source.id === choice.id);
  const groups = [
    {
      key: 'saved',
      heading: t('fittings.myFittings.title'),
      options: choices.saved.filter(isFree),
    },
    {
      key: 'inGame',
      heading: t('fittings.start.tabInGame'),
      options: choices.inGame.filter(isFree),
    },
  ].filter((group) => group.options.length > 0);
  const label = t('fittings.projected.add');

  // Always from the store's current list: an add lands after an await.
  const update = (change: (current: ProjectedSource[]) => ProjectedSource[]) =>
    setSources(change(useProjectedSources.getState().sources));

  async function add(id: string) {
    const choice = choices.all.find((c) => c.id === id);
    if (!choice) return;
    setFailed(null);
    try {
      const picked = await choices.resolve(id);
      if (picked === null) throw new Error('unreadable');
      const source = await projectionOf(id, picked.name, picked.fitting);
      update((current) =>
        current.some((s) => s.id === source.id) ? current : [...current, source]
      );
    } catch {
      setFailed(t('fittings.projected.failed', { name: choice.name }));
    }
  }

  const setCount = (id: string, count: number) =>
    update((current) =>
      current.map((s) =>
        s.id === id ? { ...s, count: Math.min(MAX_SHIPS, Math.max(1, count)) } : s
      )
    );

  return (
    <div className="space-y-3">
      {sources.length === 0 ? (
        <StatNote>{t('fittings.projected.none')}</StatNote>
      ) : (
        <StatRows>
          {sources.map((source) => (
            <li key={source.id} className={statRowClassName()}>
              <StatRowContent
                name={source.name}
                detail={
                  projectsNothing(source.projection) ? t('fittings.projected.nothing') : undefined
                }
                detailTone="warning"
                action={
                  <IconButton
                    variant="plain"
                    size="sm"
                    tone="danger"
                    icon={<Icon.Close />}
                    label={t('fittings.projected.remove', { name: source.name })}
                    onClick={() => update((current) => current.filter((s) => s.id !== source.id))}
                  />
                }
                figure={
                  <span className="flex items-center gap-1">
                    <IconButton
                      size="row"
                      icon={<Icon.Decrease />}
                      label={t('fittings.projected.fewer', { name: source.name })}
                      tooltip={t('fittings.projected.fewerShort')}
                      disabled={source.count <= 1}
                      onClick={() => setCount(source.id, source.count - 1)}
                    />
                    <span className="w-14 shrink-0 text-center tabular-nums">
                      {t('fittings.projected.count', { count: source.count })}
                    </span>
                    <IconButton
                      size="row"
                      icon={<Icon.Increase />}
                      label={t('fittings.projected.more', { name: source.name })}
                      tooltip={t('fittings.projected.moreShort')}
                      disabled={source.count >= MAX_SHIPS}
                      onClick={() => setCount(source.id, source.count + 1)}
                    />
                  </span>
                }
              />
            </li>
          ))}
        </StatRows>
      )}
      {characterId === null || (choices.ready && choices.all.length === 0) ? (
        <StatNote>{t('fittings.projected.needsCharacter')}</StatNote>
      ) : (
        groups.length > 0 && (
          // Keyed on the list, so the trigger reads the placeholder again after each pick.
          <Select key={sources.length} onValueChange={(id) => void add(id)}>
            <SelectTrigger aria-label={label} size="sm" className="w-full sm:w-64">
              <SelectValue placeholder={t('fittings.projected.addPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.key}>
                  <SelectLabel>{group.heading}</SelectLabel>
                  {group.options.map((choice) => (
                    <SelectItem key={choice.id} value={choice.id}>
                      {choice.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )
      )}
      {failed && <StatNote tone="danger">{failed}</StatNote>}
      <StatNote>{t('fittings.projected.hint')}</StatNote>
    </div>
  );
}
