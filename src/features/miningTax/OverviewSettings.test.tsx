import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BuybackRateInput, PriceBasisOptions, ShowRefiningToggle } from './OverviewSettings';

describe('PriceBasisOptions', () => {
  it('checks the choice matching the basis', () => {
    render(<PriceBasisOptions value="now-sell" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: /^Now/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Jita sell/ })).not.toBeChecked();
  });

  it('keeps the last-picked side when switching to Now', async () => {
    const onChange = vi.fn();
    render(<PriceBasisOptions value="sell" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: /^Now/ }));

    expect(onChange).toHaveBeenCalledWith('now-sell');
  });

  it('leaves Now for a mined-day side', async () => {
    const onChange = vi.fn();
    render(<PriceBasisOptions value="now-buy" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: /^Jita buy/ }));

    expect(onChange).toHaveBeenCalledWith('buy');
  });
});

describe('BuybackRateInput', () => {
  it('commits a value inside 0-100', async () => {
    const onChange = vi.fn();
    render(<BuybackRateInput value={100} onChange={onChange} />);

    const field = screen.getByLabelText('Buyback rate');
    await userEvent.clear(field);
    await userEvent.type(field, '90');

    expect(onChange).toHaveBeenLastCalledWith(90);
  });

  it('does not commit a value outside 0-100', async () => {
    const onChange = vi.fn();
    render(<BuybackRateInput value={100} onChange={onChange} />);

    const field = screen.getByLabelText('Buyback rate');
    await userEvent.clear(field);
    await userEvent.type(field, '101');

    expect(onChange).not.toHaveBeenCalledWith(101);
  });
});

describe('ShowRefiningToggle (issue #1281)', () => {
  it('reflects the current value and flips it on click', async () => {
    const onChange = vi.fn();
    render(<ShowRefiningToggle value={true} onChange={onChange} />);

    const toggle = screen.getByRole('checkbox', { name: 'Show refining' });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
