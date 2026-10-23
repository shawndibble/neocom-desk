import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { InsuranceLossModal } from './InsuranceLossModal';
import type { PilotKillmail } from '@/lib/zkillboard';

const history = vi.hoisted(() => vi.fn());
const fit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/zkillboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/zkillboard')>()),
  fetchPilotKillmailHistory: history,
}));
vi.mock('@/features/travel/pilotKillmailFit', () => ({ loadKillmailFit: fit }));
vi.mock('@/features/travel/KillmailBody', () => ({
  KillmailBody: ({ entry }: { entry: PilotKillmail }) => <p>body {entry.killmailId}</p>,
}));
vi.mock('@/sde/loadSde', () => ({ loadTypes: vi.fn(async () => ({})) }));

function loss(killmailId: number, time: string): PilotKillmail {
  return {
    killmailId,
    hash: 'h',
    side: 'loss',
    value: 1,
    detail: {
      time,
      systemId: 1,
      victim: { ship_type_id: 1 } as never,
      victimParty: { characterId: 42, corporationId: null, shipTypeId: 1 },
      finalBlow: null,
    },
  };
}

function renderModal(payoutDate = '2026-10-01T10:31:00Z') {
  return render(
    <MemoryRouter>
      <InsuranceLossModal payoutDate={payoutDate} characterId={42} onClose={() => {}} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  history.mockReset();
  fit.mockReset();
  fit.mockResolvedValue({ ok: false });
});

describe('InsuranceLossModal', () => {
  it('shows the loss whose kill time matches the payout', async () => {
    history.mockResolvedValue({
      ok: true,
      entries: [loss(2, '2026-10-01T10:30:00Z'), loss(1, '2026-09-01T10:30:00Z')],
      reachesBackTo: null,
    });
    renderModal();
    expect(await screen.findByText('body 2')).toBeTruthy();
  });

  it('says so when no loss is near the payout', async () => {
    history.mockResolvedValue({
      ok: true,
      entries: [loss(1, '2026-09-01T10:30:00Z')],
      reachesBackTo: null,
    });
    renderModal();
    expect(await screen.findByText(/No matching loss found/)).toBeTruthy();
  });

  it('says the payout is older than the list when it predates what zKillboard reaches', async () => {
    history.mockResolvedValue({
      ok: true,
      entries: [loss(1, '2026-09-20T10:30:00Z')],
      reachesBackTo: Date.parse('2026-09-15T00:00:00Z'),
    });
    renderModal('2026-09-01T10:31:00Z');
    expect(await screen.findByText(/older than the losses/)).toBeTruthy();
  });

  it('says so when zKillboard cannot be read', async () => {
    history.mockResolvedValue({ ok: false, reason: 'offline' });
    renderModal();
    expect(await screen.findByRole('status')).toHaveTextContent(/zKillboard/);
  });
});
