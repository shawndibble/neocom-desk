import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { SrpOfficerVerdict, SrpSettings } from '../srpTypes';
import { buildHullCatalog } from './hullCatalog';

vi.mock('./useHullCatalog', () => ({
  useHullCatalog: () => ({
    catalog: buildHullCatalog(
      {
        '627': { name: 'Thorax', groupID: 26, volume: 1 },
        '626': { name: 'Vexor', groupID: 26, volume: 1 },
        '587': { name: 'Rifter', groupID: 25, volume: 1 },
      },
      { '25': 6, '26': 6 }
    ),
    className: (id: number) => (id === 26 ? 'Cruiser' : 'Frigate'),
  }),
}));

import { SrpSettingsEditor } from './SrpSettingsEditor';

const settings: SrpSettings = {
  corporationId: 98,
  enabled: true,
  killmailPct: 70,
  appraisalPct: null,
  hullRules: [
    { scope: 'class', id: 25, kind: 'pay-fixed', iskAmount: 1_500_000 },
    { scope: 'hull', id: 627, kind: 'not-covered' },
  ],
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

function setup(over: { verdict?: Partial<SrpOfficerVerdict>; owner?: number } = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onReclaim = vi.fn().mockResolvedValue(undefined);
  render(
    <SrpSettingsEditor
      settings={{ ...settings, ownerCharacterId: over.owner ?? 7 }}
      verdict={{ ...verdict, ...over.verdict }}
      characterId={7}
      onSave={onSave}
      onReclaim={onReclaim}
    />
  );
  return { onSave, onReclaim };
}

describe('SrpSettingsEditor', () => {
  it('shows no save bar until something changes', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('saves only what changed', async () => {
    const { onSave } = setup();
    const win = screen.getByLabelText('Claim window');
    await userEvent.clear(win);
    await userEvent.type(win, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ windowDays: 45 }, null);
  });

  it('turns SRP off through the enabled flag, not the patch', async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: 'SRP' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({}, false);
  });

  it('blocks Save on a bad percent and says how many problems', async () => {
    const { onSave } = setup();
    const km = screen.getByLabelText('Killmail percent');
    await userEvent.clear(km);
    await userEvent.type(km, '150');
    expect(screen.getByText('1 problem to fix before saving')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Discard restores the saved values', async () => {
    setup();
    const win = screen.getByLabelText('Claim window');
    await userEvent.clear(win);
    await userEvent.type(win, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Claim window')).toHaveValue('30');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('keeps classes collapsed, opens one to its hull rules, and adds a hull from the search', async () => {
    setup();
    expect(screen.queryByText('Thorax')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Cruiser/ }));
    expect(screen.getByText('Thorax')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Add a hull' }), 'vex');
    await userEvent.click(screen.getByRole('button', { name: 'Add Vexor' }));
    expect(screen.getByLabelText('Rule for Vexor')).toHaveValue('none');
  });

  it('asks for an ISK amount only for Pay: fixed ISK, and blocks Save while it is blank', async () => {
    const { onSave } = setup();
    expect(screen.getByLabelText('Fixed price for Frigate')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fixed price for Cruiser')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Rule for Cruiser'), 'pay-fixed');
    expect(screen.getByLabelText('Fixed price for Cruiser')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers Reclaim only to a CEO when another Director owns SRP', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Reclaim SRP' })).toBeNull();
  });

  it('shows Reclaim to the CEO of a corp another Director owns', () => {
    setup({ verdict: { isCeo: true }, owner: 1 });
    expect(screen.getByRole('button', { name: 'Reclaim SRP' })).toBeInTheDocument();
  });
});
