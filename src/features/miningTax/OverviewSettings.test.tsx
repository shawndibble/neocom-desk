import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PriceBasisOptions } from './OverviewSettings';

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
