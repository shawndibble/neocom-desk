import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SkillPicker } from './SkillPicker';
import type { SkillType } from '@/sde/types';
import type { SkillCatalog } from '../skillMap';
import type { TrainedSkill } from '@/engine/types';

const EMPTY_CATALOG: SkillCatalog = {
  engineSkills: new Map(),
  bySkillTypeID: new Map(),
  unlocksByTypeID: new Map(),
};
const NO_TRAINED_SKILLS: ReadonlyMap<number, TrainedSkill> = new Map();

function skill(overrides: Partial<SkillType>): SkillType {
  return {
    typeID: 1,
    name: 'Skill',
    description: '',
    groupID: 1,
    groupName: 'Group',
    rank: 1,
    primaryAttr: 'intelligence',
    secondaryAttr: 'memory',
    prereqs: [],
    ...overrides,
  };
}

const SKILLS: SkillType[] = [
  skill({
    typeID: 1,
    name: 'Gunnery',
    description: 'Basic turret operation.',
    groupName: 'Gunnery',
  }),
  skill({
    typeID: 2,
    name: 'Spaceship Command',
    description: 'Improves turret tracking on all ships.',
    groupName: 'Spaceship Command',
  }),
  skill({
    typeID: 3,
    name: 'Mining',
    description: 'Extracts ore from asteroids.',
    groupName: 'Resource Processing',
  }),
];

describe('SkillPicker', () => {
  it('matches description text, not just name', async () => {
    render(
      <SkillPicker
        skills={SKILLS}
        catalog={EMPTY_CATALOG}
        trainedSkills={NO_TRAINED_SKILLS}
        onAdd={vi.fn()}
      />
    );
    await userEvent.type(screen.getByRole('textbox'), 'tracking');
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('Spaceship Command');
  });

  it('ranks a name match above a description-only match', async () => {
    render(
      <SkillPicker
        skills={SKILLS}
        catalog={EMPTY_CATALOG}
        trainedSkills={NO_TRAINED_SKILLS}
        onAdd={vi.fn()}
      />
    );
    await userEvent.type(screen.getByRole('textbox'), 'turret');
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Gunnery');
    expect(items[1]).toContain('Spaceship Command');
  });

  it('shows filter chips for the matched groups, toggle to narrow results', async () => {
    render(
      <SkillPicker
        skills={SKILLS}
        catalog={EMPTY_CATALOG}
        trainedSkills={NO_TRAINED_SKILLS}
        onAdd={vi.fn()}
      />
    );
    await userEvent.type(screen.getByRole('textbox'), 'e');
    const names = () => screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names().join()).toContain('Gunnery');
    expect(names().join()).toContain('Mining');

    const chip = screen.getByRole('button', { name: 'Resource Processing' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Mining');
  });

  it('narrows to a group crowded out of the unfiltered top results', async () => {
    const common = Array.from({ length: 25 }, (_, i) =>
      skill({
        typeID: 100 + i,
        name: `Common Skill ${String(i).padStart(2, '0')}`,
        description: 'A widget-adjacent skill.',
        groupName: 'CommonGroup',
      })
    );
    const rare = skill({
      typeID: 999,
      name: 'Zzz Rare Skill',
      description: 'A widget-adjacent skill.',
      groupName: 'RareGroup',
    });

    render(
      <SkillPicker
        skills={[...common, rare]}
        catalog={EMPTY_CATALOG}
        trainedSkills={NO_TRAINED_SKILLS}
        onAdd={vi.fn()}
      />
    );
    await userEvent.type(screen.getByRole('textbox'), 'widget');

    const chip = screen.getByRole('button', { name: 'RareGroup' });
    await userEvent.click(chip);

    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Zzz Rare Skill');
  });
});
