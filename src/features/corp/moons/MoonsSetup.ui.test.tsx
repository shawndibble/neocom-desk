import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { OfficerVerdict } from '../taxBook/bookClient';
import type { FeederSetupStatus } from '../taxBook/feederClient';
import { utcDay } from '@/engine/localDay';
import { MoonsSetup } from './MoonsSetup';
import { fixtureView } from './ownerViewFixtures';

const beginFeederGrantLogin = vi.fn();
vi.mock('@/app/loginFlow', () => ({
  beginFeederGrantLogin: (...a: unknown[]) => beginFeederGrantLogin(...a),
}));
const getFeederStatus = vi.fn();
const leaveFeeder = vi.fn();
const previewFeederInvite = vi.fn();
vi.mock('../taxBook/feederClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/feederClient')>()),
  getFeederStatus: (...a: unknown[]) => getFeederStatus(...a),
  leaveFeeder: (...a: unknown[]) => leaveFeeder(...a),
  previewFeederInvite: (...a: unknown[]) => previewFeederInvite(...a),
}));

vi.mock('@/features/character/names', () => ({
  resolveNames: async () => new Map<number, string>(),
}));
const loadFeederView = vi.fn();
vi.mock('../taxBook/feederViewClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/feederViewClient')>()),
  loadFeederView: (...a: unknown[]) => loadFeederView(...a),
}));

const verdict = {
  isCeo: false,
  isDirector: true,
  canEdit: true,
  bookActive: false,
} as OfficerVerdict;
const owner: FeederSetupStatus = {
  status: 'feeder',
  collectorCorporationId: 5,
  collectorName: 'B-UH Accounting',
  feederStatus: 'active',
  lastReadWellAt: null,
  lastSyncResult: null,
  requestedRatePct: null,
  effectiveRatePct: null,
  isHolder: true,
  refineries: [{ structureId: 1, label: 'Efa Refinery', volume: 1200 }],
  owedIsk: 2_500_000,
};

function renderSetup(state?: unknown, search = '', v = verdict) {
  const onDone = vi.fn();
  render(
    <MemoryRouter initialEntries={[{ pathname: '/corp/moons', search, state }]}>
      <MoonsSetup characterId={7} corporationId={98} verdict={v} onDone={onDone} />
    </MemoryRouter>
  );
  return { onDone };
}

beforeEach(() => {
  beginFeederGrantLogin.mockReset().mockResolvedValue(undefined);
  getFeederStatus.mockReset().mockResolvedValue({ status: 'none' });
  loadFeederView.mockReset().mockRejectedValue(new Error('not-your-feeder'));
  leaveFeeder.mockReset().mockResolvedValue({ left: true, owedIsk: null });
  previewFeederInvite.mockReset().mockRejectedValue(new Error('offline'));
});

describe('MoonsSetup', () => {
  it('offers the three choices side by side and never the dev terms', async () => {
    renderSetup();
    expect(await screen.findByText("Run your corporation's book")).toBeInTheDocument();
    expect(screen.getByText('Let an accounting corporation handle it')).toBeInTheDocument();
    expect(screen.getByText('Collect tax for other corporations')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/feeder|collector/i);
  });

  it('disables the book choices for a non-Director', async () => {
    renderSetup(undefined, '', { ...verdict, isDirector: false });
    await screen.findByText("Run your corporation's book");
    expect(screen.getByRole('button', { name: "Turn on your corporation's book" })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start collecting' })).toBeDisabled();
  });

  it('walks a pasted link through the consent screen to the EVE login with the rate', async () => {
    renderSetup();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Paste an invite link or code'), 'abc123DEF456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Share your mining ledger')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Rate you ask for (%, optional)'), '6');
    await user.click(screen.getByRole('button', { name: 'Continue to EVE' }));
    expect(beginFeederGrantLogin).toHaveBeenCalledWith(7, 'abc123DEF456', 6);
  });

  it('shows a plain sentence, not the server message, when the EVE login cannot start', async () => {
    beginFeederGrantLogin.mockRejectedValue(
      Object.assign(new Error('internal: raw server text'), { details: { reason: 'invite-used' } })
    );
    renderSetup(undefined, '?invite=abc123DEF456');
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to EVE' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already used/);
    expect(document.body.textContent).not.toMatch(/raw server text/);
  });

  it('does not promise moon names from a Station Manager on the consent screen', async () => {
    renderSetup(undefined, '?invite=abc123DEF456');
    await screen.findByText('Share your mining ledger');
    expect(document.body.textContent).not.toMatch(/Station Manager/);
  });

  it('treats a blank rate as a complete grant', async () => {
    renderSetup(undefined, '?invite=abc123DEF456');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue to EVE' }));
    expect(beginFeederGrantLogin).toHaveBeenCalledWith(7, 'abc123DEF456', undefined);
  });

  it('names the accounting corporation and the rate the link offers', async () => {
    previewFeederInvite.mockResolvedValue({
      collectorCorporationId: 5,
      collectorName: 'B-UH Accounting',
      offeredOwnerRatePct: 6,
    });
    renderSetup(undefined, '?invite=abc123DEF456');
    expect(await screen.findByText(/B-UH Accounting will handle/)).toBeInTheDocument();
    expect(screen.getByText(/They offer you 6%/)).toBeInTheDocument();
    expect(previewFeederInvite).toHaveBeenCalledWith(7, 'abc123DEF456');
  });

  it('says so when the link is no longer valid, and stops there', async () => {
    previewFeederInvite.mockRejectedValue(
      Object.assign(new Error('gone'), { details: { reason: 'invite-invalid' } })
    );
    renderSetup(undefined, '?invite=abc123DEF456');
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid/);
    expect(screen.getByRole('button', { name: 'Continue to EVE' })).toBeDisabled();
  });

  it("starts a former moon owner's own book on the day its coverage ended", async () => {
    // Today, so the leave day is always later than the start of the month (a fixed date stopped qualifying on the 1st of the next month).
    const leaveDay = utcDay();
    getFeederStatus.mockResolvedValue({ status: 'none', ownBookFrom: leaveDay });
    renderSetup();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: "Turn on your corporation's book" })
    );
    const date = screen.getByLabelText('Start date (EVE time)');
    expect(date).toHaveValue(leaveDay);
    expect(date).toHaveAttribute('min', leaveDay);
  });

  it('explains a refused non-Accountant alt in plain words', async () => {
    renderSetup({ feederGrant: { status: 'failed', reason: 'not-an-accountant' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/not an Accountant/);
  });

  it('shows the owner page from the view once granted', async () => {
    getFeederStatus.mockResolvedValue(owner);
    loadFeederView.mockResolvedValue({
      access: { collectorCorporationId: 5, expiresAt: 0, canEdit: true },
      view: fixtureView(),
    });
    renderSetup();
    expect(await screen.findByText(/handles the tax on your moons/)).toBeInTheDocument();
    expect(screen.queryByText("Run your corporation's book")).not.toBeInTheDocument();
  });

  it('after leaving: previously handled above the choices, history below', async () => {
    loadFeederView.mockResolvedValue({
      access: { collectorCorporationId: 5, expiresAt: 0, canEdit: true },
      view: fixtureView({ status: 'left', leftAt: Date.UTC(2026, 9, 12) }),
    });
    renderSetup();
    expect(
      await screen.findByText('Previously handled by Brass Meridian Logistics')
    ).toBeInTheDocument();
    expect(screen.getByText("Run your corporation's book")).toBeInTheDocument();
    expect(screen.getByText('Mined while they handled it')).toBeInTheDocument();
  });

  it('a dismissed after-leaving section is gone; the choices stay', async () => {
    loadFeederView.mockResolvedValue({
      access: { collectorCorporationId: 5, expiresAt: 0, canEdit: true },
      view: fixtureView({ status: 'left', dismissedAt: 1 }),
    });
    renderSetup();
    expect(await screen.findByText("Run your corporation's book")).toBeInTheDocument();
    expect(screen.queryByText(/Previously handled/)).not.toBeInTheDocument();
  });

  it('Leave says what is owed, leaves, then offers the choices again', async () => {
    getFeederStatus.mockResolvedValue(owner);
    loadFeederView.mockResolvedValue({
      access: { collectorCorporationId: 5, expiresAt: 0, canEdit: true },
      view: fixtureView({ balanceKind: 'owed', balanceIsk: 2_500_000 }),
    });
    renderSetup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(screen.getByText(/keeps 2,500,000 ISK for you/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Leave' }).at(-1)!);
    await waitFor(() => expect(leaveFeeder).toHaveBeenCalledWith(7, 98));
    expect(await screen.findByText("Run your corporation's book")).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/You have left/);
  });
});
