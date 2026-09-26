/**
 * "What if my skills were…": the skills the stats are worked out under — the
 * pilot's own, all untrained (All 0) or all at V — with single skills set to
 * a level on top (`engine/fittings/skillOverrides.ts`). For the session only,
 * and never the fit checks or the Missing Skills chip, which stay on the
 * Character's real skills.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  Modal,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { withSkillLevel, type SkillBase } from '@/engine/fittings/skillOverrides';
import { loadSkills } from '@/sde/loadSde';
import type { SkillType } from '@/sde/types';
import { useSkillOverrides } from './statsConditions';

const BASES: readonly SkillBase[] = ['character', 'all0', 'allV'];
const LEVELS = [0, 1, 2, 3, 4, 5];
/** Search results shown at once — enough to pick from, never a 500-row list. */
const MATCHES_SHOWN = 12;

function useSkillCatalogue(enabled: boolean): SkillType[] | null {
  const [skills, setSkills] = useState<SkillType[] | null>(null);
  useEffect(() => {
    if (!enabled || skills !== null) return;
    let cancelled = false;
    void loadSkills().then((loaded) => {
      if (!cancelled) setSkills(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, skills]);
  return skills;
}

function LevelSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (level: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(level) => onChange(Number(level))}>
      <SelectTrigger aria-label={label} className="w-16 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEVELS.map((level) => (
          <SelectItem key={level} value={String(level)}>
            {level}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomLevelsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const skills = useSkillOverrides((state) => state.skills);
  const setSkills = useSkillOverrides((state) => state.setSkills);
  const catalogue = useSkillCatalogue(open);
  const [query, setQuery] = useState('');
  const byId = useMemo(
    () => new Map((catalogue ?? []).map((skill) => [skill.typeID, skill])),
    [catalogue]
  );
  const overridden = Object.entries(skills.levels).map(([typeId, level]) => ({
    typeId: Number(typeId),
    level,
  }));
  const needle = query.trim().toLowerCase();
  const matches =
    needle === '' || catalogue === null
      ? []
      : catalogue
          .filter((skill) => skill.name.toLowerCase().includes(needle))
          .filter((skill) => skills.levels[skill.typeID] === undefined)
          .slice(0, MATCHES_SHOWN);
  const nameOf = (typeId: number) => byId.get(typeId)?.name ?? `#${typeId}`;
  const set = (typeId: number, level: number | null) =>
    setSkills(withSkillLevel(useSkillOverrides.getState().skills, typeId, level));

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.skillOverrides.customTitle')}>
      <div className="space-y-3">
        <p className="text-xs text-text-dim">{t('fittings.skillOverrides.customHint')}</p>
        {overridden.length > 0 && (
          <ul className="space-y-1">
            {overridden.map(({ typeId, level }) => (
              <li key={typeId} className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{nameOf(typeId)}</span>
                <LevelSelect
                  label={t('fittings.skillOverrides.levelOf', { name: nameOf(typeId) })}
                  value={level}
                  onChange={(next) => set(typeId, next)}
                />
                <IconButton
                  variant="plain"
                  size="sm"
                  icon={<Icon.Close />}
                  label={t('fittings.skillOverrides.remove', { name: nameOf(typeId) })}
                  onClick={() => set(typeId, null)}
                />
              </li>
            ))}
          </ul>
        )}
        <SearchInput
          aria-label={t('fittings.skillOverrides.search')}
          placeholder={t('fittings.skillOverrides.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {catalogue === null && needle !== '' && (
          <p className="text-xs text-text-dim">{t('fittings.skillOverrides.loading')}</p>
        )}
        <ul className="space-y-1">
          {matches.map((skill) => (
            <li key={skill.typeID}>
              <Button
                size="sm"
                align="start"
                className="min-h-11 w-full md:min-h-8"
                onClick={() => {
                  set(skill.typeID, 5);
                  setQuery('');
                }}
              >
                {t('fittings.skillOverrides.add', { name: skill.name })}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            {t('fittings.skillOverrides.done')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SkillOverridesControl() {
  const { t } = useTranslation();
  const skills = useSkillOverrides((state) => state.skills);
  const setSkills = useSkillOverrides((state) => state.setSkills);
  const [editing, setEditing] = useState(false);
  const label = t('fittings.skillOverrides.label');
  const customCount = Object.keys(skills.levels).length;
  const overridden = skills.base !== 'character' || customCount > 0;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${overridden ? 'text-warning' : ''}`}>
      <span className={overridden ? '' : 'text-text-dim'}>{label}</span>
      <Select
        value={skills.base}
        onValueChange={(base) => setSkills({ ...skills, base: base as SkillBase })}
      >
        <SelectTrigger aria-label={label} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BASES.map((base) => (
            <SelectItem key={base} value={base}>
              {t(`fittings.skillOverrides.base.${base}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="min-h-11 md:min-h-8" onClick={() => setEditing(true)}>
        {customCount > 0
          ? t('fittings.skillOverrides.customCount', { count: customCount })
          : t('fittings.skillOverrides.custom')}
      </Button>
      <CustomLevelsModal open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
