import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MoreSheetUpdateRow } from './MoreSheetUpdateRow';
import { useUpdateStatus } from './updateAvailable';

const forceUpdate = vi.fn();
vi.mock('@/app/forceUpdate', () => ({ forceUpdate: () => forceUpdate() }));

afterEach(() => {
  forceUpdate.mockReset();
  useUpdateStatus.setState({ status: 'unknown' });
});

describe('MoreSheetUpdateRow', () => {
  it('renders nothing unless an update is available', () => {
    useUpdateStatus.setState({ status: 'current' });
    const { container } = render(<MoreSheetUpdateRow />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies the update with one press', async () => {
    forceUpdate.mockResolvedValue(undefined);
    useUpdateStatus.setState({ status: 'available' });
    render(<MoreSheetUpdateRow />);
    expect(screen.getByText('Update available')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(forceUpdate).toHaveBeenCalledOnce();
  });

  it('says why when the page stays up', async () => {
    forceUpdate.mockResolvedValue('failed');
    useUpdateStatus.setState({ status: 'available' });
    render(<MoreSheetUpdateRow />);
    await userEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(await screen.findByText(/Could not check for a new version/)).toBeInTheDocument();
  });
});
