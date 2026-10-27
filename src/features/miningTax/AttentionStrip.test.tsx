import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { AttentionStrip, type AttentionItem } from './AttentionStrip';

const INFO: AttentionItem = { id: 'info', tone: 'info', title: 'Sell price used' };
const WARN_A: AttentionItem = {
  id: 'a',
  tone: 'warning',
  title: 'Log in again for Ada',
  action: <button type="button">Log in</button>,
};
const WARN_B: AttentionItem = { id: 'b', tone: 'warning', title: 'Unpriced ore' };

describe('AttentionStrip', () => {
  it('renders nothing with no items', () => {
    const { container } = render(<AttentionStrip items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('previews the only item’s title in the collapsed header, with no “more”', () => {
    render(<AttentionStrip items={[WARN_A]} />);
    const header = screen.getByRole('button', { expanded: false });
    expect(within(header).getByText('1 thing needs attention')).toBeInTheDocument();
    expect(within(header).getByText('Log in again for Ada')).toBeInTheDocument();
    expect(within(header).queryByText(/more/)).not.toBeInTheDocument();
  });

  it('previews the first warning plus “+N more”, even when an info item comes first', () => {
    render(<AttentionStrip items={[INFO, WARN_A, WARN_B]} />);
    const header = screen.getByRole('button', { expanded: false });
    expect(within(header).getByText('Log in again for Ada')).toBeInTheDocument();
    expect(within(header).getByText('+2 more')).toBeInTheDocument();
    expect(within(header).queryByText('Sell price used')).not.toBeInTheDocument();
  });

  it('drops the preview when expanded and shows every row with its action', async () => {
    render(<AttentionStrip items={[INFO, WARN_A, WARN_B]} />);
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    const header = screen.getByRole('button', { expanded: true });
    expect(within(header).queryByText('Log in again for Ada')).not.toBeInTheDocument();
    expect(within(header).queryByText('+2 more')).not.toBeInTheDocument();
    expect(screen.getByText('Log in again for Ada')).toBeInTheDocument();
    expect(screen.getByText('Unpriced ore')).toBeInTheDocument();
    expect(screen.getByText('Sell price used')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('is an alert for warnings and a status otherwise', () => {
    const { rerender } = render(<AttentionStrip items={[INFO, WARN_A]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<AttentionStrip items={[INFO]} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
