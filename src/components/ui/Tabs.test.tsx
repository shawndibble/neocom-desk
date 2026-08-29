import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const tabs = [
  { id: 'open', label: 'Open' },
  { id: 'history', label: 'History' },
];

describe('Tabs', () => {
  it('marks the active tab selected', () => {
    render(<Tabs tabs={tabs} value="history" onChange={() => undefined} label="Orders" />);
    expect(screen.getByRole('tablist', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange on click', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="open" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(onChange).toHaveBeenCalledWith('history');
  });

  it('moves selection with arrow keys, wrapping', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="open" onChange={onChange} />);
    screen.getByRole('tab', { name: 'Open' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('history');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('history');
  });
});
