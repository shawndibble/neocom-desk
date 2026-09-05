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
        onCreate={noop}
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
        onCreate={noop}
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
