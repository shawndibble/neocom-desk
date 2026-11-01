import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { MoonOwnerCards } from './MoonOwnerCards';

const row = (over: Partial<MoonOwnerRow>): MoonOwnerRow => ({
  id: '1',
  corporationId: 1,
  status: 'active',
  refineryCount: 2,
  mined: 0,
  owed: 0,
  balance: { kind: 'none', isk: 0 },
  mode: 'normal',
  ...over,
});

const NOW = Date.parse('2026-10-20T12:00:00Z');
const LONG = 'Brinewater Deep Space Extraction and Hauling Collective';

function view(rows: MoonOwnerRow[], mayPay = true) {
  const onOpen = vi.fn();
  const onPay = vi.fn();
  render(
    <MoonOwnerCards
      rows={rows}
      name={(id) => (id === 1 ? LONG : `Corp ${id}`)}
      now={NOW}
      onOpen={onOpen}
      {...(mayPay ? { onPay } : {})}
    />
  );
  return { onOpen, onPay };
}

describe('MoonOwnerCards (phone list)', () => {
  it('shows a long name and an eleven-digit amount owed on separate lines, with Pay', () => {
    view([row({ theirRatePct: 8, owed: 48_123_456_789 })]);
    expect(screen.getByText(LONG)).toBeInTheDocument();
    expect(screen.getByText(/48,123,456,789/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Pay ${LONG}` })).toBeInTheDocument();
  });

  it('opens the row from its name or body, but Pay does not open it', () => {
    const { onOpen, onPay } = view([row({ theirRatePct: 8, owed: 500 })]);
    fireEvent.click(screen.getByRole('button', { name: LONG }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: `Pay ${LONG}` }));
    expect(onPay).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('reads Settled with no Pay on his own corps, and says Yours', () => {
    view([row({ id: '2', corporationId: 2, mode: 'settled-otherwise', sameOwner: true })]);
    expect(screen.getByText('Yours')).toBeInTheDocument();
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
  });

  it('flags a ledger that cannot be read with its date, and any non-active status', () => {
    view([
      row({
        id: '3',
        corporationId: 3,
        status: 'cant-read',
        theirRatePct: 7,
        owed: 10,
        staleSince: Date.UTC(2026, 9, 11, 9),
      }),
    ]);
    expect(screen.getByText(/Can't read their ledger since/)).toBeInTheDocument();
  });

  it('offers no Pay to a viewer who may not record payments', () => {
    view([row({ theirRatePct: 8, owed: 500 })], false);
    expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
  });
});
