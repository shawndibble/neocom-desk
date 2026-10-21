import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import type { FeederView } from '../taxBook/feederViewClient';
import { MoonOwnerPage } from './MoonOwnerPage';
import { MoonOwnerView } from './MoonOwnerView';
import { fixtureView, nameOf } from './ownerViewFixtures';

const Router = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const JITA = 30000142;
/** Resolved names: the miners, the moon owner corporation (98) and one system. */
const resolved = (id: number) =>
  id === 98 ? 'Ashfall Mining Collective' : id === JITA ? 'Jita' : nameOf(id);

/** Refinery 10 carries a label, 11 only its system, 12 nothing at all. */
function chainView(): FeederView {
  const base = fixtureView();
  return {
    ...base,
    refineries: [
      {
        structureId: 10,
        label: 'Efa Tatara',
        labelSetAt: '2026-10-12T00:00:00Z',
        solarSystemId: null,
      },
      { structureId: 11, label: null, solarSystemId: JITA },
      { structureId: 12, label: null, solarSystemId: null },
    ],
    days: base.days.map((d) => ({
      ...d,
      lines: [...d.lines, { characterId: 1, structureId: 12, volume: 10, valueIsk: 1_000 }],
    })),
  };
}

function ownerView(props: Partial<Parameters<typeof MoonOwnerView>[0]> = {}) {
  const onSetRefineryLabel = vi.fn().mockResolvedValue(undefined);
  render(
    <MoonOwnerView
      view={chainView()}
      names={(id) => resolved(id)}
      nameOf={(id) => (id === 98 || id === JITA ? resolved(id) : undefined)}
      canEdit
      onRequestRate={vi.fn()}
      onSetRefineryLabel={onSetRefineryLabel}
      {...props}
    />
  );
  return { onSetRefineryLabel };
}

describe("moon owner's own page: refinery labels (#4640)", () => {
  it('runs every refinery cell through the chain: label, system, then its own name and the id', () => {
    ownerView();
    expect(screen.getAllByText('Efa Tatara').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Jita').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Ashfall Mining Collective 12').length).toBeGreaterThan(1);
    expect(document.body.textContent).not.toMatch(/feeder|collector/i);
  });

  it('edits a label in place and clears one with an empty field', async () => {
    const { onSetRefineryLabel } = ownerView();
    await userEvent.click(screen.getByRole('button', { name: 'Label Jita' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Refinery label' }),
      'Gate Athanor{Enter}'
    );
    expect(onSetRefineryLabel).toHaveBeenCalledWith(11, 'Gate Athanor');

    await userEvent.click(screen.getByRole('button', { name: 'Label Efa Tatara' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Refinery label' }));
    await userEvent.keyboard('{Enter}');
    expect(onSetRefineryLabel).toHaveBeenLastCalledWith(10, null);
  });

  it('shows a refusal as translated text, never the server message, and keeps the draft', async () => {
    const refusal = Object.assign(new Error('This moon owner has left'), {
      details: { reason: 'feeder-ended' },
    });
    ownerView({ onSetRefineryLabel: vi.fn().mockRejectedValue(refusal) });
    await userEvent.click(screen.getByRole('button', { name: 'Label Jita' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Refinery label' }), 'X{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('This connection has already ended.')
    );
    expect(screen.queryByText('This moon owner has left')).toBeNull();
    // The field reopens with what was typed.
    expect(screen.getByRole('textbox', { name: 'Refinery label' })).toHaveValue('X');
  });

  it('Escape keeps the label as it was', async () => {
    const { onSetRefineryLabel } = ownerView();
    await userEvent.click(screen.getByRole('button', { name: 'Label Jita' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Refinery label' }), 'X{Escape}');
    expect(onSetRefineryLabel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Label Jita' })).toHaveFocus();
  });

  it('has no pencil for a non-officer', () => {
    ownerView({ canEdit: false });
    expect(screen.queryByRole('button', { name: /^Label / })).toBeNull();
  });
});

const detail = {
  row: {
    id: '98',
    corporationId: 98,
    status: 'active',
    refineryCount: 2,
    mined: 0,
    theirRatePct: 8,
    minerRatePct: 12,
    owed: 0,
    balance: { kind: 'even', isk: 0 },
    mode: 'normal',
  },
  joinedAt: Date.UTC(2026, 8, 28),
  history: [],
  payouts: [],
  hasPayee: true,
  accrued: 0,
  paid: 0,
  payee: { kind: 'corporation', id: 98 },
  mined: [
    { characterId: 1, structureId: 10, oreTypeIds: [1], quantity: 10, value: 100 },
    { characterId: 2, structureId: 10, oreTypeIds: [1], quantity: 10, value: 100 },
    { characterId: 1, structureId: 12, oreTypeIds: [1], quantity: 10, value: 100 },
  ],
} as unknown as MoonOwnerDetail;

function accountingPage(props: Partial<Parameters<typeof MoonOwnerPage>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <MoonOwnerPage
      detail={detail}
      name="Ashfall Mining Collective"
      characterName={nameOf}
      refineryName={(id) => (id === 10 ? 'Efa Tatara' : `Ashfall Mining Collective ${id}`)}
      refineryEdit={{ current: (id) => (id === 10 ? 'Efa Tatara' : ''), onSave }}
      oreName={String}
      backTo="/corp/moons/moon-owners"
      {...props}
    />,
    { wrapper: Router }
  );
  return { onSave };
}

describe('accounting side: refinery labels (#4640)', () => {
  it('lists each refinery once and labels one in place', async () => {
    const { onSave } = accountingPage();
    expect(screen.getAllByRole('button', { name: /^Label / })).toHaveLength(2);
    await userEvent.click(
      screen.getByRole('button', { name: 'Label Ashfall Mining Collective 12' })
    );
    const field = screen.getByRole('textbox', { name: 'Refinery label' });
    expect(field).toHaveValue('');
    await userEvent.type(field, 'North Athanor{Enter}');
    expect(onSave).toHaveBeenCalledWith(12, 'North Athanor');
  });

  it('saves nothing when the label did not change', async () => {
    const { onSave } = accountingPage();
    await userEvent.click(screen.getByRole('button', { name: 'Label Efa Tatara' }));
    expect(screen.getByRole('textbox', { name: 'Refinery label' })).toHaveValue('Efa Tatara');
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('has no pencil for a viewer who may not edit', () => {
    accountingPage({ refineryEdit: undefined });
    expect(screen.queryByRole('button', { name: /^Label / })).toBeNull();
  });
});
