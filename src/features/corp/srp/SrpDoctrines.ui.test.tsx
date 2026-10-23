import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { setSrpDoctrineBackendOverride } from '../srpDoctrineBackendOverride';
import type { DoctrineFit, SrpOfficerVerdict, SrpSettings } from '../srpTypes';
import { buildHullCatalog } from './hullCatalog';

vi.mock('./useHullCatalog', () => ({
  useHullCatalog: () => ({
    catalog: buildHullCatalog(
      {
        '627': { name: 'Thorax', groupID: 26, volume: 1 },
        '626': { name: 'Vexor', groupID: 26, volume: 1 },
      },
      { '26': 6 }
    ),
    className: () => 'Cruiser',
  }),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async (ids: number[]) =>
    new Map(ids.map((id) => [id, id === 627 ? 'Thorax' : `Item ${id}`])),
}));
vi.mock('@/features/fittings/useSavedFittingRecords', () => ({
  useSavedFittingRecords: () => [],
}));
const eft = vi.hoisted(() => vi.fn());
vi.mock('./doctrineSources', () => ({
  snapshotFromEft: eft,
  snapshotFromFitting: vi.fn(),
}));

import { SrpSettingsEditor } from './SrpSettingsEditor';

const settings: SrpSettings = {
  corporationId: 98,
  enabled: true,
  killmailPct: 70,
  appraisalPct: null,
  hullRules: [{ scope: 'hull', id: 627, kind: 'officer-decides' }],
  windowDays: 30,
  requireFleetOrFc: false,
  createdBy: 7,
  createdAt: 1,
  ownerCharacterId: 7,
  updatedAt: 1,
  updatedBy: 7,
};
const verdict: SrpOfficerVerdict = {
  corporationId: 98,
  isCeo: false,
  isDirector: true,
  canManage: true,
  srpEnabled: true,
  expiresAt: 1,
};
const fit = (id: string, name: string, hullTypeId: number): DoctrineFit => ({
  id,
  name,
  snapshot: { hullTypeId, name, modules: [1, 2, 3], rigs: [4] },
  createdBy: 7,
  createdAt: 1,
});

let fits: DoctrineFit[];
const save = vi.fn((input: { name: string }) => {
  fits = [...fits, fit('new', input.name, 627)];
  return { id: 'new' };
});
const remove = vi.fn((id: string) => {
  fits = fits.filter((f) => f.id !== id);
});

function setup() {
  fits = [fit('a', 'Thorax - brawl', 627), fit('b', 'Vexor - kite', 626)];
  setSrpDoctrineBackendOverride({ list: () => fits, save, remove });
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <SrpSettingsEditor
      settings={settings}
      verdict={verdict}
      characterId={7}
      onSave={onSave}
      saveFailed={false}
      onReclaim={vi.fn()}
    />
  );
  return { onSave };
}

afterEach(() => {
  cleanup();
  setSrpDoctrineBackendOverride(null);
  vi.clearAllMocks();
});

describe('Doctrine Fits in SRP settings', () => {
  it('lists the corp fits, one Delete… per row', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Doctrine Fits' });
    expect(within(table).getByText('Thorax - brawl')).toBeTruthy();
    expect(within(table).getAllByRole('button', { name: /^Delete / })).toHaveLength(2);
  });

  it('attaches a fit to its hull rule and saves the ids, offering only fits of that hull', async () => {
    const { onSave } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /Cruiser/ }));
    const group = await screen.findByRole('group', { name: 'Doctrine Fits for Thorax' });
    expect(within(group).queryByText('Vexor - kite')).toBeNull();
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Thorax - brawl' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      { hullRules: [{ scope: 'hull', id: 627, kind: 'officer-decides', doctrineIds: ['a'] }] },
      null
    );
  });

  it('lists unresolved EFT lines and still adds the fit', async () => {
    eft.mockResolvedValue({
      ok: true,
      fit: { hullTypeId: 627, name: 'Pasted', modules: [1], rigs: [] },
      unresolved: [{ line: 4, text: 'Not A Real Module', reason: 'x', kind: 'unknown-item' }],
    });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Paste EFT…' }));
    await userEvent.click(await screen.findByLabelText('EFT text'));
    await userEvent.paste('[Thorax, Pasted]');
    expect(await screen.findByText('1 line not recognised')).toBeTruthy();
    expect(screen.getByText('Line 4: Not A Real Module')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add Doctrine Fit' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toMatchObject({ name: 'Pasted' });
    expect((await screen.findAllByText('Pasted')).length).toBeGreaterThan(0);
  });

  it('says so when pasted text has no ship, and does not add', async () => {
    eft.mockResolvedValue({ ok: false, unresolved: [] });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Paste EFT…' }));
    await userEvent.type(await screen.findByLabelText('EFT text'), 'hello');
    expect(await screen.findByText(/No ship found/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Add Doctrine Fit' }).getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('deletes a fit after a confirm', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Vexor - kite…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Doctrine Fit' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(screen.queryByText('Vexor - kite')).toBeNull());
  });
});
