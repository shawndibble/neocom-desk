import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { PlanList } from './PlanList';
import type { SkillPlanRecord } from '@/db';

function plan(id: string, name: string): SkillPlanRecord {
  return {
    id,
    name,
    entries: [],
    remapCount: 0,
    updatedAt: new Date().toISOString(),
  } as unknown as SkillPlanRecord;
}

const noop = () => {};

describe('PlanList delete confirmation (#408: names the plan)', () => {
  it('names the plan being deleted in the confirmation modal', () => {
    render(
      <PlanList
        plans={[plan('1', 'Titan pilot')]}
        onOpen={noop}
        onDuplicate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /delete titan pilot/i }));
    expect(screen.getByText(/delete "titan pilot"/i)).toBeInTheDocument();
  });

  it('deletes the plan whose row triggered the confirmation, even with multiple plans', () => {
    const onDelete = vi.fn();
    render(
      <PlanList
        plans={[plan('1', 'Alpha'), plan('2', 'Beta')]}
        onOpen={noop}
        onDuplicate={noop}
        onDelete={onDelete}
        onRename={noop}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /delete beta/i }));
    expect(screen.getByText(/delete "beta"/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('2');
  });
});

describe('PlanList row stats (#1416)', () => {
  const props = {
    onOpen: noop,
    onDuplicate: noop,
    onDelete: noop,
    onRename: noop,
  };

  it('shows duration and finish under the name, and "Nothing to train" for an empty plan', () => {
    render(
      <PlanList
        plans={[plan('1', 'Alpha'), plan('2', 'Beta')]}
        {...props}
        stats={
          new Map([
            ['1', { totalSeconds: 86_400, finish: new Date(2026, 0, 2) }],
            ['2', { totalSeconds: 0, finish: null }],
          ])
        }
      />
    );
    expect(screen.getByText(/1d.*· finishes/)).toBeInTheDocument();
    expect(screen.getByText('Nothing to train')).toBeInTheDocument();
  });

  it('renders the name only without stats', () => {
    render(<PlanList plans={[plan('1', 'Alpha')]} {...props} />);
    expect(screen.queryByText(/finishes|Nothing to train/)).not.toBeInTheDocument();
  });
});

describe('PlanList copy to character (#1729)', () => {
  const props = { onOpen: noop, onDuplicate: noop, onDelete: noop, onRename: noop };

  it('hides the action when the account has no other character', () => {
    render(<PlanList {...props} plans={[plan('1', 'Alpha')]} onCopyToCharacter={noop} />);
    expect(screen.queryByRole('button', { name: /copy to character/i })).toBeNull();
  });

  it('copies the plan to the chosen character', () => {
    const onCopy = vi.fn();
    render(
      <PlanList
        {...props}
        plans={[plan('1', 'Alpha'), plan('2', 'Beta')]}
        otherCharacters={[{ characterId: 9, name: 'Alt One' }]}
        onCopyToCharacter={onCopy}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /copy to character.* beta/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Alt One' }));
    expect(onCopy).toHaveBeenCalledWith('2', 9);
  });
});
