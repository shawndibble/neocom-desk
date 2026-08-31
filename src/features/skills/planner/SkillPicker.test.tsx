import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { SkillType } from '@/sde/types';
import type { TrainedSkill } from '@/engine/types';
import { buildUnlockIndex } from '@/engine/skillUnlocks';
import type { SkillCatalog } from '../skillMap';
import { SkillPicker } from './SkillPicker';

function skill(overrides: Partial<SkillType> & Pick<SkillType, 'typeID' | 'name'>): SkillType {
  return {
    groupID: 1,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
    ...overrides,
  };
}

const SKILLS: SkillType[] = [
  skill({ typeID: 1, name: 'Frigate', groupName: 'Spaceship Command' }),
  skill({ typeID: 2, name: 'Frigate Prefix Skill', groupName: 'Spaceship Command' }),
  skill({ typeID: 3, name: 'A Substring Frigate Skill', groupName: 'Spaceship Command' }),
  skill({ typeID: 4, name: 'Zzz Named Skill', groupName: 'Frigate' }),
];

/** The picker only reads the catalog to render prerequisites and unlocks. */
const CATALOG: SkillCatalog = (() => {
  const engineSkills = new Map(
    SKILLS.map((s) => [
      s.typeID,
      {
        typeID: s.typeID,
        name: s.name,
        rank: s.rank,
        primary: s.primaryAttr,
        secondary: s.secondaryAttr,
        prereqs: s.prereqs.map((p) => ({ typeID: p.skillTypeID, level: p.level })),
      },
    ])
  );
  return {
    engineSkills,
    bySkillTypeID: new Map(SKILLS.map((s) => [s.typeID, s])),
    unlocksByTypeID: buildUnlockIndex(engineSkills),
  };
})();

const NO_TRAINED: ReadonlyMap<number, TrainedSkill> = new Map();

describe('SkillPicker', () => {
  it('shows nothing until a query is typed', () => {
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('ranks name matches exact > prefix > substring, with a group-name-only match last', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );

    await user.type(screen.getByRole('textbox'), 'frigate');

    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Frigate'),
      expect.stringContaining('Frigate Prefix Skill'),
      expect.stringContaining('A Substring Frigate Skill'),
      expect.stringContaining('Zzz Named Skill'),
    ]);
  });

  it('still matches purely on groupName (no regression from the pre-rankedSearch OR-filter)', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );

    await user.type(screen.getByRole('textbox'), 'spaceship command');

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('calls onAdd with the picked skill and level, then clears the query', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={onAdd} />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'frigate');
    const firstItem = screen.getAllByRole('listitem')[0];
    if (!firstItem) throw new Error('expected at least one result');
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));
    await user.click(screen.getByRole('button', { name: 'Level III' }));

    expect(onAdd).toHaveBeenCalledWith({ skillTypeID: 1, targetLevel: 3 });
    expect(input).toHaveValue('');
  });
});
