import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { SkillPlanRecord } from '@/db';
import type { TrainedSkill } from '@/engine/types';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { RequiredSkillsSection } from './RequiredSkillsSection';

const GUNNERY = 3300;
const SMALL_ENERGY = 3303;

function plan(id: string, name: string): SkillPlanRecord {
  return { id, name, entries: [] } as unknown as SkillPlanRecord;
}

const target: TargetPlan = {
  plans: [plan('a', 'Current Queue'), plan('b', 'Logi alt')],
  targetPlanId: 'a',
  setTargetPlanId: vi.fn(),
  addEntries: vi.fn(),
  removeEntries: vi.fn(),
};

function trained(levels: Record<number, number>): ReadonlyMap<number, TrainedSkill> {
  return new Map(
    Object.entries(levels).map(([id, level]) => [Number(id), { level } as TrainedSkill])
  );
}

function renderSection(levels: Record<number, number>) {
  render(
    <MemoryRouter>
      <RequiredSkillsSection
        requiredSkills={[
          { skillTypeID: GUNNERY, level: 2 },
          { skillTypeID: SMALL_ENERGY, level: 1 },
        ]}
        skillNames={{ [GUNNERY]: 'Gunnery', [SMALL_ENERGY]: 'Small Energy Turret' }}
        trainedSkills={trained(levels)}
        target={target}
        hasCharacter
        itemName="Dual Light Beam Laser I"
      />
    </MemoryRouter>
  );
}

describe('RequiredSkillsSection', () => {
  it('hides the plan picker when every required skill is trained', () => {
    renderSection({ [GUNNERY]: 5, [SMALL_ENERGY]: 1 });
    expect(screen.getByText('Gunnery')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Adding to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to Skill Plan' })).not.toBeInTheDocument();
  });

  it('shows the picker and an Add on the short row when a skill is untrained', () => {
    renderSection({ [GUNNERY]: 1, [SMALL_ENERGY]: 1 });
    expect(screen.getByRole('combobox', { name: /Adding to/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add to Skill Plan' })).toHaveLength(1);
  });
});
