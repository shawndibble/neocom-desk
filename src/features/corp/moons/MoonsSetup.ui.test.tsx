import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { OfficerVerdict } from '../taxBook/bookClient';
import type { FeederStatus } from '../taxBook/feederClient';
import { MoonsSetup } from './MoonsSetup';

const beginFeederGrantLogin = vi.fn();
vi.mock('@/app/loginFlow', () => ({
  beginFeederGrantLogin: (...a: unknown[]) => beginFeederGrantLogin(...a),
}));
const getFeederStatus = vi.fn();
const leaveFeeder = vi.fn();
vi.mock('../taxBook/feederClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/feederClient')>()),
  getFeederStatus: (...a: unknown[]) => getFeederStatus(...a),
  leaveFeeder: (...a: unknown[]) => leaveFeeder(...a),
}));

const verdict = {
  isCeo: false,
  isDirector: true,
  canEdit: true,
  bookActive: false,
} as OfficerVerdict;
const owner: FeederStatus = {
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
  leaveFeeder.mockReset().mockResolvedValue({ left: true, owedIsk: null });
});

describe('MoonsSetup', () => {
  it('offers the three choices side by side and never the dev terms', async () => {
    renderSetup();
    expect(await screen.findByText('Run our own book')).toBeInTheDocument();
    expect(screen.getByText('Let an accounting corporation handle it')).toBeInTheDocument();
    expect(screen.getByText('Collect tax for other corporations')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/feeder|collector/i);
  });

  it('disables the book choices for a non-Director', async () => {
    renderSetup(undefined, '', { ...verdict, isDirector: false });
    await screen.findByText('Run our own book');
    expect(screen.getByRole('button', { name: 'Turn on our own book' })).toBeDisabled();
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

  it('treats a blank rate as a complete grant', async () => {
    renderSetup(undefined, '?invite=abc123DEF456');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue to EVE' }));
    expect(beginFeederGrantLogin).toHaveBeenCalledWith(7, 'abc123DEF456', undefined);
  });

  it('explains a refused non-Accountant alt in plain words', async () => {
    renderSetup({ feederGrant: { status: 'failed', reason: 'not-an-accountant' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/not an Accountant/);
  });

  it('shows what is mined, the sync state and "no rate set" once granted', async () => {
    getFeederStatus.mockResolvedValue(owner);
    renderSetup();
    expect(await screen.findByText('Efa Refinery')).toBeInTheDocument();
    expect(screen.getByText('Waiting for the first sync.')).toBeInTheDocument();
    expect(screen.getByText('No rate set.')).toBeInTheDocument();
    expect(screen.queryByText('Run our own book')).not.toBeInTheDocument();
  });

  it('Leave says what is owed, leaves, then offers the choices again', async () => {
    getFeederStatus.mockResolvedValue(owner);
    renderSetup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(screen.getByText(/keeps 2,500,000 ISK for you/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Leave' }).at(-1)!);
    await waitFor(() => expect(leaveFeeder).toHaveBeenCalledWith(7, 98));
    expect(await screen.findByText('Run our own book')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/You have left/);
  });
});
