import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import type { RealizedProfitResult } from '@/engine/industry/realizedProfit';
import { RealizedProfitBreakdown } from './RealizedProfitBreakdown';

const PROFIT: RealizedProfitResult = {
  totalCost: 1_000_000,
  quantitySold: 0,
  grossRevenue: 0,
  salesTax: 0,
  brokerFee: 0,
  netRevenue: 0,
  profit: -1_000_000,
  marginPct: null,
};

function rowText(dialog: HTMLElement, label: string) {
  return within(dialog).getByText(label).closest('div')?.querySelector('dd')?.textContent;
}

describe('RealizedProfitBreakdown', () => {
  it('shows a loss and an unavailable margin', () => {
    render(
      <RealizedProfitBreakdown
        open
        onClose={() => undefined}
        profit={PROFIT}
        accountingLevel={0}
        brokerRelationsLevel={0}
      />
    );
    const dialog = screen.getByRole('dialog');

    expect(rowText(dialog, 'Profit')).toBe('-1,000,000');
    expect(within(dialog).getByText('Profit').closest('div')?.querySelector('dd')).toHaveClass(
      'text-danger'
    );
    expect(rowText(dialog, 'Margin')).toBe('—');
    expect(within(dialog).getByText('needs gross revenue above zero')).toBeInTheDocument();
    expect(within(dialog).queryByText('Cost of lost units')).toBeNull();
  });
});
