import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { canPayMoonOwner, type MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { MoonOwnersTable } from './MoonOwnersTable';

const row = (over: Partial<MoonOwnerRow>): MoonOwnerRow => ({
  id: '1',
  corporationId: 1,
  status: 'active',
  refineryCount: 1,
  mined: 0,
  owed: 0,
  balance: { kind: 'none', isk: 0 },
  mode: 'normal',
  ...over,
});

describe('MoonOwnersTable: his own corps', () => {
  const rows = [
    row({
      id: '1',
      corporationId: 1,
      mode: 'settled-otherwise',
      sameOwner: true,
      refineryCount: 2,
    }),
    row({ id: '2', corporationId: 2, theirRatePct: 5, owed: 90 }),
  ];
  const view = () =>
    render(
      <MoonOwnersTable
        rows={rows}
        totals={{ owed: 90, paidThisMonth: 0, count: 2, needALook: 0 }}
        name={(id) => `Corp ${id}`}
        now={Date.parse('2026-10-20T12:00:00Z')}
        onOpen={() => {}}
        onPay={() => {}}
      />
    );

  it('marks only his own corps Yours, reading no owner rate and no payouts', () => {
    view();
    expect(screen.getAllByText('Yours')).toHaveLength(1);
    expect(screen.getByText(/2 refineries · no owner rate · no payouts/)).toBeInTheDocument();
  });

  it('never offers Pay on one', () => {
    view();
    expect(screen.getAllByRole('button', { name: /^Pay/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Pay Corp 2' })).toBeInTheDocument();
    expect(canPayMoonOwner(rows[0]!)).toBe(false);
  });
});
