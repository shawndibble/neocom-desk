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
  useUpdateStatus.setState({ status: 'unknown', build: null, found: 0 });
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

  it('has no button of its own: the icon it points at applies', async () => {
    forceUpdate.mockResolvedValue(undefined);
    useUpdateStatus.setState({ status: 'available' });
    render(<RailUpgradeButton />);
    await screen.findByText('A new version is ready.');
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(forceUpdate).toHaveBeenCalledOnce();
  });

  it('opens again when a second, different build is found in the same tab', async () => {
    useUpdateStatus.setState({ status: 'available', build: 'neocom-desk@9', found: 0 });
    render(<RailUpgradeButton />);
    await screen.findByText('A new version is ready.');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('A new version is ready.')).toBeNull();

    act(() => useUpdateStatus.setState({ build: 'neocom-desk@10', found: 1 }));
    expect(await screen.findByText('A new version is ready.')).toBeInTheDocument();
  });
});
