import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillRequirementsList } from './SkillRequirementsList';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';

beforeEach(() => {
  useSkillDetailModalStore.setState({ request: null });
});

describe('SkillRequirementsList', () => {
  it('opens the shared Skill Detail popover for a prereq name (#405)', () => {
    render(
      <SkillRequirementsList
        prereqs={[{ typeID: 3300, name: 'Spaceship Command', level: 1, trained: true }]}
        unlocks={[]}
      />
    );

    fireEvent.click(screen.getByText('Spaceship Command'));

    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3300 });
  });

  it('opens the shared Skill Detail popover for an unlock name (#405)', () => {
    render(
      <SkillRequirementsList prereqs={[]} unlocks={[{ typeID: 3301, name: 'Frigate', level: 3 }]} />
    );

    fireEvent.click(screen.getByText('Frigate'));

    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3301 });
  });
});
