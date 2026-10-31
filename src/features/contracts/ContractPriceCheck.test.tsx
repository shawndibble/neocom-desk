import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ContractPriceCheck } from './ContractPriceCheck';

const ROWS = [
  { label: 'Asking price', value: '476,740,542 ISK' },
  { label: 'Buy orders', value: '512,319,400 ISK' },
  { label: 'Difference', value: '−6.9%', note: 'Asking is below buy orders' },
];

describe('ContractPriceCheck', () => {
  it('lists the rows under its heading', () => {
    render(<ContractPriceCheck heading="Price check · Jita 4-4" rows={ROWS} />);
    const region = screen.getByRole('region', { name: 'Price check · Jita 4-4' });
    expect(within(region).getByText('512,319,400 ISK')).toBeInTheDocument();
    expect(within(region).getByText('Asking is below buy orders')).toBeInTheDocument();
  });

  it('flips sides from a button that names the current side', async () => {
    const onFlip = vi.fn();
    render(
      <ContractPriceCheck
        heading="Price check"
        rows={ROWS}
        flip={{ label: 'Buy orders', showOther: 'Show sell orders', onFlip }}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Buy orders' }));
    expect(onFlip).toHaveBeenCalledOnce();
  });

  it('indents a part of the line above, and keeps it in the same list', () => {
    render(
      <ContractPriceCheck
        heading="Price check"
        rows={[
          { label: 'Sell orders', value: '1 ISK' },
          { label: 'Your search', value: '1 ISK', sub: true },
        ]}
      />
    );
    expect(screen.getByText('Your search').closest('div')).toHaveClass('pl-3');
  });

  it('says why there is no figure instead of showing rows, and never a 0 value', () => {
    render(
      <ContractPriceCheck heading="Price check" message="No Open Price for Oct 17" rows={ROWS} />
    );
    expect(screen.getByText('No Open Price for Oct 17')).toBeInTheDocument();
    expect(screen.queryByText('512,319,400 ISK')).not.toBeInTheDocument();
  });

  it('shows a loading state while prices load', () => {
    render(<ContractPriceCheck heading="Price check" busy rows={ROWS} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('512,319,400 ISK')).not.toBeInTheDocument();
  });

  it('tints a row by its tone and leaves a row without one neutral', () => {
    render(
      <ContractPriceCheck
        heading="Price check"
        rows={[
          { label: 'Saving', value: '+4.0%', tone: 'good' },
          { label: 'Loss', value: '−4.0%', tone: 'bad' },
          { label: 'Plain', value: '1.0%' },
        ]}
      />
    );
    expect(screen.getByText('+4.0%')).toHaveClass('text-isk-pos');
    expect(screen.getByText('−4.0%')).toHaveClass('text-isk-neg');
    expect(screen.getByText('1.0%')).not.toHaveClass('text-isk-pos', 'text-isk-neg');
  });
});
