import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { RailUpgradeButton } from './RailUpgradeButton';
import { useUpdateStatus } from './updateAvailable';

const forceUpdate = vi.fn();
vi.mock('@/app/forceUpdate', () => ({ forceUpdate: () => forceUpdate() }));

afterEach(() => {
  forceUpdate.mockReset();
  useUpdateStatus.setState({ status: 'unknown' });
});

describe('RailUpgradeButton', () => {
  it('renders nothing unless an update is available', () => {
    useUpdateStatus.setState({ status: 'current' });
    render(<RailUpgradeButton />);
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  it('applies the update on click', () => {
    forceUpdate.mockResolvedValue(undefined);
    useUpdateStatus.setState({ status: 'available' });
    render(<RailUpgradeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(forceUpdate).toHaveBeenCalledOnce();
  });

  it('opens a callout when a build is found, and a press outside dismisses it', async () => {
    useUpdateStatus.setState({ status: 'current' });
    render(<RailUpgradeButton />);
    expect(screen.queryByText('A new version is ready.')).toBeNull();

    act(() => useUpdateStatus.setState({ status: 'available' }));
    expect(await screen.findByText('A new version is ready.')).toBeInTheDocument();

    await userEvent.click(document.body);
    expect(screen.queryByText('A new version is ready.')).toBeNull();
    // Dismissing never applied anything.
    expect(forceUpdate).not.toHaveBeenCalled();
    // The icon itself stays for later.
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
  });

  it('applies the update from the callout button', async () => {
    forceUpdate.mockResolvedValue(undefined);
    useUpdateStatus.setState({ status: 'available' });
    render(<RailUpgradeButton />);
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }));
    expect(forceUpdate).toHaveBeenCalledOnce();
  });
});
