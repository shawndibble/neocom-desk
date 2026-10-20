import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { UpdateButton } from './UpdateButton';

const isUpdateAvailable = vi.fn();
const forceUpdate = vi.fn();
vi.mock('@/app/updateAvailable', () => ({ isUpdateAvailable: () => isUpdateAvailable() }));
vi.mock('@/app/forceUpdate', () => ({ forceUpdate: () => forceUpdate() }));

beforeEach(() => {
  isUpdateAvailable.mockReset();
  forceUpdate.mockReset();
});

describe('UpdateButton', () => {
  it('is muted but pressable when no update is found', async () => {
    isUpdateAvailable.mockResolvedValue(false);
    forceUpdate.mockResolvedValue('failed');
    render(<UpdateButton />);
    const button = screen.getByRole('button', { name: 'Update app' });
    expect(button).toHaveClass('text-text-dim!');
    await userEvent.click(button);
    expect(forceUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('highlights once the check finds a waiting build', async () => {
    isUpdateAvailable.mockResolvedValue(true);
    render(<UpdateButton />);
    const button = screen.getByRole('button', { name: 'Update app' });
    await vi.waitFor(() => expect(button).toHaveClass('text-accent'));
    expect(button).not.toHaveClass('text-text-dim!');
  });
});
