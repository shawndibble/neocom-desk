import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
