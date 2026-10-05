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

vi.mock('@/app/useGrantedScopes', () => ({
  useGrantedScopes: () => ['esi-search.search_structures.v1'],
}));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number | null }) => unknown) =>
    select({ activeCharacterId: 91 }),
}));
const searchBuildLocations = vi.hoisted(() => vi.fn());
vi.mock('./searchBuildLocations', () => ({ searchBuildLocations, MIN_SEARCH_LENGTH: 3 }));

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

  it('fills facility, system and location from a searched pick and hands them to Apply', async () => {
    searchBuildLocations.mockResolvedValue([
      {
        structureId: 1035,
        name: 'K2-18 R&D',
        facility: 'azbel',
        systemId: 30003888,
        systemName: 'Badivefi',
        security: 'highsec',
      },
    ]);
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <RetargetGroupDialog
        group={GROUP}
        plans={[plan({ id: 'p1', name: 'Hull A' })]}
        onApply={onApply}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByRole('combobox', { name: 'Build location' }), 'K2-18');
    await user.click(await screen.findByRole('option', { name: /K2-18 R&D/ }));
    // A structure shows its rig slots, like the plan page.
    expect(screen.getByRole('combobox', { name: 'Rig 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply.mock.calls[0][0]).toMatchObject({
      facility: 'azbel',
      security: 'highsec',
      buildSystemId: 30003888,
      buildSystemName: 'Badivefi',
      buildLocationId: 1035,
      buildLocationName: 'K2-18 R&D',
    });
  });
});
