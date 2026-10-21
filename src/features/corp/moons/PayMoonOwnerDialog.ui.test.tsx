import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { PayMoonOwnerDialog } from './PayMoonOwnerDialog';

const open = (balance: number) =>
  render(
    <PayMoonOwnerDialog
      ownerName="Ashfall Industries"
      payee={{ id: 98000002, name: 'Ashfall Industries' }}
      balance={balance}
      period={{ from: '2026-10-01', to: '2026-10-17' }}
      manual
      onClose={vi.fn()}
      onRecord={vi.fn()}
    />
  );

describe('PayMoonOwnerDialog', () => {
  it('reads a credit the moon owner already holds as a credit before the payment', () => {
    open(-5_000.4);
    expect(screen.getByText(/Owed to them credit of 5,000 →/)).toBeInTheDocument();
  });

  it('reads what is owed before the payment', () => {
    open(1_200_000.7);
    expect(screen.getByText(/Owed to them 1,200,000 →/)).toBeInTheDocument();
  });
});
