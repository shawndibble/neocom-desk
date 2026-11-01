import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CORPS } from './addCorpsFixtures';
import { ConfirmBatchDialog } from './ConfirmBatchDialog';

const noop = () => {};

describe('ConfirmBatchDialog', () => {
  it('says what the book sees, marks the corps Yours and defaults to From today', () => {
    render(<ConfirmBatchDialog corps={CORPS} onBack={noop} onConnect={noop} onClose={noop} />);
    expect(screen.getByRole('heading', { name: 'Connect 12 corps' })).toBeInTheDocument();
    expect(screen.getByText('What this book will see')).toBeInTheDocument();
    expect(screen.getByText('What it will not see')).toBeInTheDocument();
    expect(screen.getByText('Yours')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'How far back' })).toHaveValue('today');
  });

  it('connects with the chosen window for the whole batch', async () => {
    const onConnect = vi.fn();
    render(<ConfirmBatchDialog corps={CORPS} onBack={noop} onConnect={onConnect} onClose={noop} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'How far back' }), '14');
    await userEvent.click(screen.getByRole('button', { name: 'Connect 12 corps' }));
    expect(onConnect).toHaveBeenCalledWith(14);
  });

  it('connects from today by default, goes back and lists the batch on demand', async () => {
    const onConnect = vi.fn();
    const onBack = vi.fn();
    render(
      <ConfirmBatchDialog
        corps={CORPS.slice(0, 1)}
        onBack={onBack}
        onConnect={onConnect}
        onClose={noop}
      />
    );
    expect(screen.queryByText(/Kestrel Vane/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Corps in this batch \(1\)/ }));
    expect(screen.getByText(/Ironvale Reach · Kestrel Vane/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Connect 1 corp' }));
    expect(onConnect).toHaveBeenCalledWith('today');
  });
});
