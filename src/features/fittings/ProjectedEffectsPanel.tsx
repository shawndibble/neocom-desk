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
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { db, type FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { applyImplantBasis, defaultImplantBasis } from '@/engine/fittings/implantBasis';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import { projectsNothing } from '@/engine/fittings/projection';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import { loadSkills } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { computeOutgoing } from './dogmaFittingEngine';
import { useProjectedSources, type ProjectedSource } from './statsConditions';

const MAX_SHIPS = 20;

/** What one ship of a saved Fitting projects, at all skills V. */
async function projectionOf(record: FittingRecord): Promise<ProjectedSource | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  const fitting = shareToFitting(decoded.value, record.name);
  const allV = buildAllVProfile((await loadSkills()).map((skill) => skill.typeID));
  const pilot = applyImplantBasis(allV, fitting.implantSet, defaultImplantBasis(fitting));
  return {
    id: record.id,
    name: record.name,
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
  const records = useLiveQuery(
    () =>
      characterId === null
        ? Promise.resolve([] as FittingRecord[])
        : db.fittings.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  const options = (records ?? [])
    .filter((record) => !sources.some((source) => source.id === record.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const label = t('fittings.projected.add');

  // Always from the store's current list: an add lands after an await.
  const update = (change: (current: ProjectedSource[]) => ProjectedSource[]) =>
    setSources(change(useProjectedSources.getState().sources));

  async function add(id: string) {
    const record = records?.find((r) => r.id === id);
    if (!record) return;
    setFailed(null);
    try {
      const source = await projectionOf(record);
      if (source === null) throw new Error('unreadable');
      update((current) =>
        current.some((s) => s.id === source.id) ? current : [...current, source]
      );
    } catch {
      setFailed(t('fittings.projected.failed', { name: record.name }));
    }
  }

  const setCount = (id: string, count: number) =>
    update((current) =>
      current.map((s) =>
        s.id === id ? { ...s, count: Math.min(MAX_SHIPS, Math.max(1, count)) } : s
      )
    );

  return (
    <div className="space-y-2 text-xs">
      <p className="text-text-dim">{t('fittings.projected.hint')}</p>
      {sources.length === 0 ? (
        <p className="text-text-dim">{t('fittings.projected.none')}</p>
      ) : (
        <ul className="space-y-1">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-2 rounded-xs bg-panel-2 p-1.5"
            >
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate text-sm">{source.name}</span>
                {projectsNothing(source.projection) && (
                  <span className="block text-warning">{t('fittings.projected.nothing')}</span>
                )}
              </span>
              <Button
                size="sm"
                className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
                aria-label={t('fittings.projected.fewer', { name: source.name })}
                disabled={source.count <= 1}
                onClick={() => setCount(source.id, source.count - 1)}
              >
                −
              </Button>
              <span className="w-14 shrink-0 text-center tabular-nums">
                {t('fittings.projected.count', { count: source.count })}
              </span>
              <Button
                size="sm"
                className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
                aria-label={t('fittings.projected.more', { name: source.name })}
                disabled={source.count >= MAX_SHIPS}
                onClick={() => setCount(source.id, source.count + 1)}
              >
                +
              </Button>
              <IconButton
                variant="plain"
                size="sm"
                tone="danger"
                icon={<Icon.Close />}
                label={t('fittings.projected.remove', { name: source.name })}
                onClick={() => update((current) => current.filter((s) => s.id !== source.id))}
              />
            </li>
          ))}
        </ul>
      )}
      {characterId === null || (records !== undefined && records.length === 0) ? (
        <p className="text-text-dim">{t('fittings.projected.needsCharacter')}</p>
      ) : (
        options.length > 0 && (
          // Keyed on the list, so the trigger reads the placeholder again after each pick.
          <Select key={sources.length} onValueChange={(id) => void add(id)}>
            <SelectTrigger aria-label={label} className="w-full sm:w-64">
              <SelectValue placeholder={t('fittings.projected.addPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((record) => (
                <SelectItem key={record.id} value={record.id}>
                  {record.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      )}
      {failed && <p className="text-danger">{failed}</p>}
    </div>
  );
}
