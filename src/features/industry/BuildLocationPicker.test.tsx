/**
 * The picker's own behaviour, with the corp gate and the structure load mocked.
 * The end-to-end corp path (scopes, roles, MSW) is already pinned by
 * `ActiveJobsPanel.corp.test.tsx`; what matters here is the hide rule, the
 * opt-in fetch, and that picking fills every field in one edit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BuildLocationPicker } from './BuildLocationPicker';
import type { BuildStructureOption } from './buildStructures';

const corpOwner = vi.hoisted(() => ({
  value: {
    owner: 'personal' as const,
    setOwner: vi.fn(),
    available: true,
    corporationId: 98 as number | null,
  },
}));
vi.mock('@/features/corp/owner', () => ({ useCorpOwner: () => corpOwner.value }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number | null }) => unknown) =>
    select({ activeCharacterId: 91 }),
}));

const loadBuildStructureOptions = vi.hoisted(() => vi.fn());
vi.mock('./loadBuildStructures', () => ({ loadBuildStructureOptions }));

const AZBEL: BuildStructureOption = {
  structureId: 1035,
  name: 'K2-18 R&D',
  facility: 'azbel',
  systemId: 30003888,
  systemName: 'Badivefi',
  security: 'highsec',
};

beforeEach(() => {
  corpOwner.value = { owner: 'personal', setOwner: vi.fn(), available: true, corporationId: 98 };
  loadBuildStructureOptions.mockReset();
  loadBuildStructureOptions.mockResolvedValue([AZBEL]);
});

function renderPicker(onPick = vi.fn()) {
  render(<BuildLocationPicker onPick={onPick} />);
  return onPick;
}

describe('BuildLocationPicker', () => {
  it('fetches nothing until the pilot asks — the corp read is opt-in', () => {
    renderPicker();

    expect(loadBuildStructureOptions).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Fill from a corp structure' })).toBeInTheDocument();
  });

  it('fills facility, security and build system in a single edit', async () => {
    const user = userEvent.setup();
    const onPick = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Fill from a corp structure' }));
    await user.selectOptions(await screen.findByLabelText('Corp structure'), '1035');

    expect(onPick).toHaveBeenCalledExactlyOnceWith(AZBEL);
  });

  it('labels a structure ESI withheld a name for by what and where it is', async () => {
    const user = userEvent.setup();
    loadBuildStructureOptions.mockResolvedValue([{ ...AZBEL, name: null }]);
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Fill from a corp structure' }));

    expect(await screen.findByRole('option', { name: 'Azbel in Badivefi' })).toBeInTheDocument();
  });

  it('keeps showing the structure that was picked', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Fill from a corp structure' }));
    const select = await screen.findByLabelText('Corp structure');
    await user.selectOptions(select, '1035');

    expect((select as HTMLSelectElement).value).toBe('1035');
  });

  it('says so when the corp owns no manufacturing structure', async () => {
    const user = userEvent.setup();
    loadBuildStructureOptions.mockResolvedValue([]);
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Fill from a corp structure' }));

    expect(
      await screen.findByText('No manufacturing structures in this corp.')
    ).toBeInTheDocument();
  });

  it('renders no corp control at all for a Character without the capability', () => {
    // The hide rule (CONTEXT.md round 35): no lock, no disabled button, nothing.
    corpOwner.value = {
      owner: 'personal',
      setOwner: vi.fn(),
      available: false,
      corporationId: null,
    };
    renderPicker();

    expect(screen.queryByRole('button', { name: 'Fill from a corp structure' })).toBeNull();
    expect(screen.queryByLabelText('Corp structure')).toBeNull();
  });
});
