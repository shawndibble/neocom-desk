import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { WherePaymentGoes } from './WherePaymentGoes';
import type { PayDay } from './paymentLanding';

const day = (n: number, taxOwed: number, over: Partial<PayDay> = {}): PayDay => ({
  id: `c:${n}`,
  date: `2026-10-${String(n).padStart(2, '0')}`,
  taxOwed,
  ...over,
});
const held = { until: '2026-11-30', kind: 'notPaying' as const };
const days = [day(1, 1_000_000), day(2, 2_000_000, { held }), day(3, 3_000_000)];

describe('WherePaymentGoes', () => {
  it('shows the oldest-first line and follows the amount', () => {
    const { rerender } = render(
      <WherePaymentGoes corpName="Bureau" days={days} amount={1_000_000} />
    );
    expect(screen.getByText(/Bureau's book pays your oldest days first/)).toBeInTheDocument();
    expect(screen.getAllByText('Paid by this')).toHaveLength(1);
    expect(screen.getByText('Next in line')).toBeInTheDocument();
    rerender(<WherePaymentGoes corpName="Bureau" days={days} amount={2_000_000} />);
    expect(screen.getAllByText('Paid by this')).toHaveLength(1);
    expect(screen.getByText('Part paid')).toBeInTheDocument();
  });

  it('never shows a held day as paid, and says why', () => {
    render(<WherePaymentGoes corpName="Bureau" days={days} amount={99_000_000} />);
    expect(screen.getByText('Held')).toBeInTheDocument();
    expect(screen.getAllByText('Paid by this')).toHaveLength(2);
    expect(
      screen.getByText('Not paying. Waiting on Bureau, so no payment lands here.')
    ).toBeInTheDocument();
  });

  it('folds days past the eighth', () => {
    const many = Array.from({ length: 11 }, (_, i) => day(i + 1, 1_000_000));
    render(<WherePaymentGoes corpName="Bureau" days={many} amount={0} />);
    expect(screen.getAllByText('Next in line')).toHaveLength(8);
    expect(screen.getByText('and 3 more days')).toBeInTheDocument();
  });

  it('renders nothing without open days', () => {
    const { container } = render(<WherePaymentGoes corpName="Bureau" days={[]} amount={5} />);
    expect(container).toBeEmptyDOMElement();
  });
});
