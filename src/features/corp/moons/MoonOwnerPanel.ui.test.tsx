import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { FeederSetupStatus } from '../taxBook/feederClient';
import { MoonOwnerPanel } from './MoonOwnerPanel';
import { fixtureView } from './ownerViewFixtures';

const beginFeederGrantLogin = vi.fn();
vi.mock('@/app/loginFlow', () => ({
  beginFeederGrantLogin: (...a: unknown[]) => beginFeederGrantLogin(...a),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: async () => new Map([[1, 'Varro Kestane']]),
}));
const loadFeederView = vi.fn();
const requestFeederRate = vi.fn();
vi.mock('../taxBook/feederViewClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/feederViewClient')>()),
  loadFeederView: (...a: unknown[]) => loadFeederView(...a),
  requestFeederRate: (...a: unknown[]) => requestFeederRate(...a),
}));
vi.mock('../taxBook/feederClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/feederClient')>()),
  leaveFeeder: vi.fn().mockResolvedValue({ left: true, owedIsk: 1 }),
}));

const owner: Extract<FeederSetupStatus, { status: 'feeder' }> = {
  status: 'feeder',
  collectorCorporationId: 5,
  collectorName: 'Brass Meridian Logistics',
  feederStatus: 'active',
  lastReadWellAt: null,
  lastSyncResult: null,
  requestedRatePct: null,
  effectiveRatePct: null,
  isHolder: true,
  refineries: [],
  owedIsk: 100,
};

function ready(over = {}) {
  loadFeederView.mockResolvedValue({
    access: { collectorCorporationId: 5, expiresAt: 0, canEdit: true },
    view: fixtureView(over),
  });
}
const mount = (canLeave = true) =>
  render(
    <MoonOwnerPanel
      owner={owner}
      characterId={7}
      corporationId={98}
      canLeave={canLeave}
      onLeft={vi.fn()}
    />
  );

beforeEach(() => {
  loadFeederView.mockReset();
  requestFeederRate.mockReset().mockResolvedValue({ ok: true });
  beginFeederGrantLogin.mockReset().mockResolvedValue(undefined);
});

describe('MoonOwnerPanel', () => {
  it('renders the owner page from the view and keeps Leave', async () => {
    ready();
    mount();
    expect(await screen.findByText('Varro Kestane')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeVisible();
  });

  it('shows the stale banner and Reconnect starts the grant round trip', async () => {
    ready({ staleSince: Date.UTC(2026, 9, 11) });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Reconnect' }));
    await waitFor(() =>
      expect(beginFeederGrantLogin).toHaveBeenCalledWith(7, 'reconnect-existing')
    );
  });

  it('offers to grant again for refinery names on a grant from before, through the grant round trip (#4654)', async () => {
    ready({ refineryNamesGranted: false });
    mount();
    expect(await screen.findByText('Refinery names not shared')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Grant again' }));
    await waitFor(() =>
      expect(beginFeederGrantLogin).toHaveBeenCalledWith(7, 'reconnect-existing')
    );
  });

  it('asks nothing when the grant reads names, the view predates it, or the ledger is stale (#4654)', async () => {
    for (const over of [
      { refineryNamesGranted: true },
      {},
      { refineryNamesGranted: false, staleSince: Date.UTC(2026, 9, 11) },
    ]) {
      ready(over);
      const { unmount } = mount();
      expect(await screen.findByText('Varro Kestane')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Grant again' })).toBeNull();
      unmount();
    }
  });

  it('sends a requested rate then reloads the view', async () => {
    ready();
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ask for a different rate…' }));
    const field = screen.getByLabelText('Rate you ask for (%)');
    await user.clear(field);
    await user.type(field, '7');
    await user.click(screen.getByRole('button', { name: 'Ask for this rate' }));
    await waitFor(() => expect(requestFeederRate).toHaveBeenCalledWith(7, 98, 7));
    await waitFor(() => expect(loadFeederView).toHaveBeenCalledTimes(2));
  });

  it('shows the pending removal with its time and End it now, which asks before leaving', async () => {
    ready({
      status: 'pending-removal',
      removalStartedAt: Date.UTC(2026, 9, 17, 14, 22),
      removalEffectiveAt: Date.UTC(2026, 9, 18, 14, 22),
    });
    mount();
    expect(
      await screen.findByText('Removal pending, takes effect 18 Oct 2026 14:22 EVE time')
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'End it now' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('End the removal now?');
  });

  it('shows what is still owed from the loaded page when leaving, not the server answer', async () => {
    ready({ balanceKind: 'owed', balanceIsk: 13_024_480.6 });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('13,024,480 ISK');
  });

  it('says nothing is owed when the page shows no balance', async () => {
    ready({ balanceKind: 'even', balanceIsk: 0 });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('owes you nothing right now');
  });

  it('shows a plain sentence, not the server message, when Reconnect fails', async () => {
    ready({ staleSince: Date.UTC(2026, 9, 11) });
    beginFeederGrantLogin.mockRejectedValue(new Error('internal: raw server text'));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Reconnect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not connect/);
    expect(document.body.textContent).not.toMatch(/raw server text/);
  });

  it('offers no End it now to an officer who may not leave', async () => {
    ready({ status: 'pending-removal', removalStartedAt: 1, removalEffectiveAt: null });
    mount(false);
    expect(await screen.findByText('Removal pending')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'End it now' })).toBeNull();
  });

  it('keeps "Previously handled by" for each accounting corporation it left (#4621)', async () => {
    loadFeederView.mockImplementation(async (_c: number, _corp: number, collector?: number) =>
      collector === 4
        ? {
            access: { collectorCorporationId: 4, expiresAt: 0, canEdit: true },
            view: fixtureView({
              status: 'left',
              collectorCorporationId: 4,
              collectorName: 'Old Ledger Holdings',
              leftAt: Date.UTC(2026, 8, 30),
              coverageTo: '2026-09-29',
            }),
          }
        : {
            access: { collectorCorporationId: 5, expiresAt: 0, canEdit: true },
            view: fixtureView(),
          }
    );
    render(
      <MoonOwnerPanel
        owner={{ ...owner, previousCollectorIds: [4] }}
        characterId={7}
        corporationId={98}
        canLeave
        onLeft={vi.fn()}
      />
    );
    expect(await screen.findByText('Previously handled by Old Ledger Holdings')).toBeVisible();
    expect(loadFeederView).toHaveBeenCalledWith(7, 98, 4);
  });

  it('says it is waiting when the view is not built yet', async () => {
    loadFeederView.mockResolvedValue({
      access: { collectorCorporationId: 5, expiresAt: 0, canEdit: true },
      view: null,
    });
    mount();
    expect(await screen.findByText('Waiting for the first sync.')).toBeVisible();
  });

  it('offers a retry when the view cannot be loaded', async () => {
    loadFeederView.mockRejectedValue(new Error('boom'));
    mount();
    expect(await screen.findByText('boom')).toBeVisible();
  });
});
