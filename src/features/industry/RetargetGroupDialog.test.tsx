import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BuildGroup } from './buildGroups';
import { RetargetGroupDialog } from './RetargetGroupDialog';

function plan(overrides: Partial<BuildPlanRecord> & { id: string; name: string }): BuildPlanRecord {
  return {
    characterId: 1,
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

const GROUP: BuildGroup = { id: 'g1', name: 'Doctrine', order: 0 };

describe('RetargetGroupDialog', () => {
  it('applies nothing until Apply is clicked, and calls onApply once with every member checked by default', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <RetargetGroupDialog
        group={GROUP}
        plans={[plan({ id: 'p1', name: 'Hull A' }), plan({ id: 'p2', name: 'Hull B' })]}
        onApply={onApply}
        onClose={vi.fn()}
      />
    );

    // Editing the form and merely opening the preview must not write anything.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [, planIds] = onApply.mock.calls[0];
    expect(new Set(planIds)).toEqual(new Set(['p1', 'p2']));
  });

  it('skips a plan unchecked in the preview', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <RetargetGroupDialog
        group={GROUP}
        plans={[plan({ id: 'p1', name: 'Hull A' }), plan({ id: 'p2', name: 'Hull B' })]}
        onApply={onApply}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('checkbox', { name: /Hull B/ }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const [, planIds] = onApply.mock.calls[0];
    expect(planIds).toEqual(['p1']);
  });
});
