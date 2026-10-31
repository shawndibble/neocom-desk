import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { MemberClaimsColumnPicker, MemberClaimsList } from './MemberClaimsList';
import type { MemberClaim } from './srpMemberModel';

const claim = (killmailId: number, over: Partial<MemberClaim> = {}): MemberClaim => ({
  killmailId,
  killmailHash: 'a'.repeat(40),
  hullTypeId: killmailId,
  classId: 1,
  solarSystemId: 30000142,
  killedAt: Date.UTC(2026, 9, 1),
  filedAt: Date.UTC(2026, 9, 2),
  state: 'pending',
  amount: 1_000_000,
  rejectionReason: null,
  refileCount: 0,
  ...over,
});

const HULLS: Record<number, string> = { 1: 'Hurricane', 2: 'Abaddon' };

function setup() {
  render(
    <MemoryRouter>
      <MemberClaimsColumnPicker />
      <MemberClaimsList
        claims={[claim(1), claim(2, { amount: 5_000_000 })]}
        hullName={(id) => HULLS[id]}
        systemName={() => 'Jita'}
        onOpen={vi.fn()}
        onRefile={vi.fn()}
      />
    </MemoryRouter>
  );
}

const shipNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

afterEach(cleanup);

describe('MemberClaimsList', () => {
  it('sorts by ship when its header is clicked', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /^ship/i }));
    expect(shipNames()).toEqual(['Abaddon', 'Hurricane']);
  });

  it('drops a column unticked in the Columns menu, and keeps the ship column', async () => {
    setup();
    expect(screen.getByRole('columnheader', { name: /^system/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /system/i }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('columnheader', { name: /^system/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^ship/i })).toBeInTheDocument();
  });
});
