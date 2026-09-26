import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const outgoing = vi.hoisted(() => ({
  computeOutgoing: vi.fn(async () => ({
    buffs: [],
    effects: [{ typeId: 26913, effectId: -86, attributes: { [-45]: 42.5 } }],
  })),
}));
vi.mock('./dogmaFittingEngine', () => ({ computeOutgoing: outgoing.computeOutgoing }));
vi.mock('@/sde/loadSde', () => ({ loadSkills: async () => [{ typeID: 3300 }] }));
vi.mock('@/engine/fitting/fittingShare', () => ({
  decodeFittingShare: async () => ({
    ok: true,
    value: {
      hullTypeId: 621,
      modules: { high: [], mid: [], low: [], rig: [], subsystem: [] },
      drones: [],
      fighters: [],
      cargo: [],
    },
  }),
}));

const { ProjectedEffectsPanel } = await import('./ProjectedEffectsPanel');
const { useProjectedSources, useStatsConditions } = await import('./statsConditions');

beforeEach(async () => {
  await db.fittings.clear();
  await db.fittings.put({
    id: 'logi',
    characterId: 7,
    name: 'Logi Caracal',
    code: 'x',
    updatedAt: 1,
  });
  useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
});

afterEach(() => {
  useProjectedSources.setState({ sources: [] });
  useActiveCharacter.setState({ activeCharacterId: null });
});

function Conditions() {
  const conditions = useStatsConditions();
  return <output>{conditions.projected ? conditions.projected.effects.length : 'none'}</output>;
}

describe('ProjectedEffectsPanel', () => {
  it('projects a saved fitting onto the stats, as many ships of it as asked', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ProjectedEffectsPanel />
        <Conditions />
      </>
    );
    expect(screen.getByRole('status')).toHaveTextContent('none');

    await user.click(await screen.findByRole('combobox', { name: 'Project a saved fitting' }));
    await user.click(await screen.findByRole('option', { name: 'Logi Caracal' }));
    expect(await screen.findByText('Logi Caracal')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'One more Logi Caracal' }));
    expect(screen.getByText('2 ships')).toBeInTheDocument();
    // Each ship's reps land.
    expect(screen.getByRole('status')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'Stop projecting Logi Caracal' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('none'));
  });

  it('says a Character is needed when there are no saved fittings to project', () => {
    useActiveCharacter.setState({ activeCharacterId: null });
    render(<ProjectedEffectsPanel />);
    expect(
      screen.getByText('Save fittings to My Fittings to project them onto this one.')
    ).toBeInTheDocument();
  });
});
