import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { SkillNameButton } from './SkillNameButton';

beforeEach(() => {
  useSkillDetailModalStore.setState({ request: null });
});

describe('SkillNameButton', () => {
  it('opens the shared skill detail modal for its skill', () => {
    render(<SkillNameButton skillTypeID={3300}>Gunnery</SkillNameButton>);

    fireEvent.click(screen.getByRole('button', { name: 'Gunnery' }));

    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3300 });
  });

  it('carries the open Skill Plan entries into the modal', () => {
    const planEntries = [{ skillTypeID: 3300, targetLevel: 3 }];
    render(
      <SkillNameButton skillTypeID={3315} planEntries={planEntries}>
        Surgical Strike
      </SkillNameButton>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Surgical Strike' }));

    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3315, planEntries });
  });

  it('shows the accent focus ring and keeps the caller layout classes', () => {
    render(
      <SkillNameButton skillTypeID={3300} className="flex-1 text-text">
        Gunnery
      </SkillNameButton>
    );

    const button = screen.getByRole('button', { name: 'Gunnery' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('focus-visible:outline-accent', 'flex-1', 'text-text');
  });
});
