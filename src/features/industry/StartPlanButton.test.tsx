import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { StartPlanButton } from './StartPlanButton';

describe('StartPlanButton', () => {
  it('says it is starting, and ignores further clicks, while the plan is created', async () => {
    let finish: (navigated: boolean) => void = () => {};
    const onStart = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    render(<StartPlanButton onStart={onStart} />);

    await userEvent.click(screen.getByRole('button', { name: 'Plan' }));
    const busy = screen.getByRole('button', { name: 'Starting…' });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(onStart).toHaveBeenCalledTimes(1);

    // Navigating away: stays busy until the page it leaves unmounts.
    finish(true);
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('comes back when no plan was started', async () => {
    render(<StartPlanButton onStart={() => Promise.resolve(false)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plan' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Plan' })).toBeEnabled());
  });

  it('comes back when creating the plan failed', async () => {
    render(<StartPlanButton onStart={() => Promise.reject(new Error('quota'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plan' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Plan' })).toBeEnabled());
  });
});
