import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { seedGrant } from '@/test/seed';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { MoonOwnerPage } from './MoonOwnerPage';
import { PayeeChangeStrip } from './MoonOwnerPayee';
import { MoonOwnerView } from './MoonOwnerView';
import { fixtureView, nameOf } from './ownerViewFixtures';

const searchMock = vi.hoisted(() => ({
  searchPayeeEntities: vi.fn(async () => [] as unknown[]),
  resolvePayeeName: vi.fn(async () => [] as unknown[]),
}));
vi.mock('@/features/miningTax/payeeEntitySearch', () => ({
  MIN_PAYEE_SEARCH_LENGTH: 3,
  searchPayeeEntities: searchMock.searchPayeeEntities,
  resolvePayeeName: searchMock.resolvePayeeName,
}));
vi.mock('@/app/useGrantedScopes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/useGrantedScopes')>()),
  useEndpointsGranted: () => true,
}));

const Router = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const names = (id: number) =>
  id === 98 ? 'Ashfall Mining Collective' : id === 77 ? 'Kestrel Vane' : nameOf(id);

function ownerView(
  over: Parameters<typeof fixtureView>[0] = {},
  props: Partial<Parameters<typeof MoonOwnerView>[0]> = {}
) {
  const onSetPayee = vi.fn().mockResolvedValue(undefined);
  render(
    <MoonOwnerView
      view={fixtureView(over)}
      names={names}
      canEdit
      onRequestRate={vi.fn()}
      characterId={1}
      onSetPayee={onSetPayee}
      {...props}
    />
  );
  return { onSetPayee };
}

async function pick(name: string, kind: 'character' | 'corporation' | 'alliance', id: number) {
  const user = userEvent.setup();
  searchMock.searchPayeeEntities.mockResolvedValue([{ id, name, kind }]);
  await user.click(screen.getByRole('button', { name: 'Change who gets paid…' }));
  await user.type(screen.getByLabelText('Corporation or player'), name.slice(0, 5));
  await user.click(await screen.findByRole('option', { name: new RegExp(name) }));
  return user;
}

describe('moon owner payee line', () => {
  it('shows the moon owner corporation when no payee is set', () => {
    ownerView();
    expect(screen.getByText('Who gets paid: Ashfall Mining Collective')).toBeVisible();
  });

  it('shows the payee the moon owner set', () => {
    ownerView({ payee: { kind: 'character', id: 77 } });
    expect(screen.getByText('Who gets paid: Kestrel Vane')).toBeVisible();
  });

  it('changes it to a picked player or corporation', async () => {
    const { onSetPayee } = ownerView();
    const user = await pick('Kestrel Vane', 'character', 77);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSetPayee).toHaveBeenCalledWith({ kind: 'character', id: 77 }, 'Kestrel Vane')
    );
  });

  const AT = Date.UTC(2026, 9, 21, 15);

  it('says who set it and when: this side, or the accounting corporation (#4653)', () => {
    ownerView({
      payee: { kind: 'character', id: 77 },
      payeeSetBy: { side: 'moon-owner', at: AT },
    });
    expect(screen.getByText('Set by you on 21 Oct')).toBeVisible();
    expect(screen.queryByRole('status', { name: /who gets paid changed/i })).toBeNull();
  });

  it('shows a notice when the accounting corporation changed it, until dismissed', async () => {
    localStorage.clear();
    const over = {
      payee: { kind: 'character' as const, id: 77 },
      payeeSetBy: { side: 'accounting' as const, at: AT },
    };
    ownerView(over);
    expect(screen.getByText('Set by Brass Meridian Logistics on 21 Oct')).toBeVisible();
    const notice = screen.getByRole('status', { name: 'Who gets paid changed' });
    expect(notice).toHaveTextContent(
      'Payments now go to Kestrel Vane. Brass Meridian Logistics changed this on 21 Oct.'
    );
    expect(notice.textContent).not.toMatch(/48|hour|wait|remov|feeder|collector/i);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status', { name: 'Who gets paid changed' })).toBeNull();
    // Dismissed on this device: it stays gone on the next visit.
    cleanup();
    ownerView(over);
    expect(screen.queryByRole('status', { name: 'Who gets paid changed' })).toBeNull();
  });

  it('saves nothing typed but not picked, and refuses an alliance', async () => {
    ownerView();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Change who gets paid…' }));
    await user.type(screen.getByLabelText('Corporation or player'), 'Somebody');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await pick('Goonswarm Federation', 'alliance', 1354830081);
    expect(screen.getByRole('alert')).toHaveTextContent("An alliance can't be paid.");
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('has no Change… for a viewer who may not edit', () => {
    ownerView({}, { canEdit: false });
    expect(screen.queryByRole('button', { name: 'Change who gets paid…' })).toBeNull();
  });

  it('has no Change… once the ledger link is disconnected', () => {
    ownerView({ status: 'disconnected' });
    expect(screen.getByText('Who gets paid: Ashfall Mining Collective')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Change who gets paid…' })).toBeNull();
  });

  it('never explains a waiting period in the dialog', async () => {
    ownerView();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change who gets paid…' }));
    expect(screen.getByRole('dialog').textContent).not.toMatch(/48|hour|wait|feeder|collector/i);
  });
});

const detail = {
  row: {
    id: '98',
    corporationId: 98,
    status: 'active',
    refineryCount: 1,
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
  payee: { kind: 'character', id: 77 },
  mined: [],
} as unknown as MoonOwnerDetail;

describe('accounting side payee', () => {
  it('shows who the moon owner is paid as, read-only, with Open in EVE', async () => {
    await seedGrant(9, ['esi-ui.open_window.v1']);
    useActiveCharacter.setState({ activeCharacterId: 9, hydrated: true });
    render(
      <MoonOwnerPage
        detail={detail}
        name="Ashfall Mining Collective"
        characterName={nameOf}
        refineryName={String}
        oreName={String}
        backTo="/corp/moons/moon-owners"
        payee={{ kind: 'character', id: 77, name: 'Kestrel Vane' }}
        onPay={vi.fn()}
      />,
      { wrapper: Router }
    );
    expect(screen.getByText('Paid to')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Kestrel Vane' })).toHaveAttribute(
      'href',
      expect.stringContaining('info=character-77')
    );
    expect(await screen.findByRole('button', { name: 'Open in EVE: Kestrel Vane' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /who gets paid/i })).toBeNull();
  });

  it('offers Change… to an officer who may edit (#4653)', async () => {
    const onChangePayee = vi.fn();
    render(
      <MoonOwnerPage
        detail={detail}
        name="Ashfall Mining Collective"
        characterName={nameOf}
        refineryName={String}
        oreName={String}
        backTo="/corp/moons/moon-owners"
        payee={{ kind: 'character', id: 77, name: 'Kestrel Vane' }}
        onChangePayee={onChangePayee}
        payeeNotice={<p>notice slot</p>}
      />,
      { wrapper: Router }
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change who gets paid…' }));
    expect(onChangePayee).toHaveBeenCalled();
    expect(screen.getByText('notice slot')).toBeVisible();
  });

  it('the notice names the moon owner that changed it', () => {
    localStorage.clear();
    render(
      <PayeeChangeStrip
        storageKey="test"
        at={Date.UTC(2026, 9, 21)}
        payeeName="Kestrel Vane"
        byName="Ashfall Mining Collective"
      />
    );
    expect(screen.getByRole('status', { name: 'Who gets paid changed' })).toHaveTextContent(
      'Payments now go to Kestrel Vane. Ashfall Mining Collective changed this on 21 Oct.'
    );
  });
});
