import type { TFunction } from 'i18next';
import { romanLevel } from '@/engine/projection';
import type { ShipTreeClassSkill } from '@/sde/types';

/** A class icon's title: its name, then "Caldari Frigate III — have 1" per class skill. */
export function classSkillTitle(
  t: TFunction,
  className: string,
  skills: readonly ShipTreeClassSkill[],
  trainedLevel: (skillTypeID: number) => number,
  skillName: (skillTypeID: number) => string
): string {
  return [
    className,
    ...skills.map((p) =>
      t('ships.tree.classSkill', {
        skill: skillName(p.skillTypeID),
        level: romanLevel(p.level),
        have: trainedLevel(p.skillTypeID),
      })
    ),
  ].join('\n');
}
