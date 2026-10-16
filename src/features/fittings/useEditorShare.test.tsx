import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui';
import { useEditorShare } from './useEditorShare';

vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
const shared = vi.hoisted(() => ({ loadShareStatus: vi.fn(), toggleShare: vi.fn() }));
vi.mock('@/features/communities/sharedFittings', () => shared);

const PALS = { id: 'c1', name: 'Pals', adminUid: 'char:2', inviteCode: null, memberCount: 2 };
const CREW = { id: 'c2', name: 'Crew', adminUid: 'char:2', inviteCode: null, memberCount: 2 };
const RECORD = { id: 'r1', name: 'Kite', code: 'CODE' };

function Menu({ record = RECORD as typeof RECORD | null }) {
  const { items, notice } = useEditorShare(7, record);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>Export</DropdownMenuTrigger>
        <DropdownMenuContent>{items}</DropdownMenuContent>
      </DropdownMenu>
      <p role="status">{notice}</p>
    </>
  );
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

beforeEach(() => {
  vi.clearAllMocks();
  shared.toggleShare.mockResolvedValue('shared');
});

describe('useEditorShare', () => {
  it('adds nothing for an unsaved Fitting, and never reads Communities for it', async () => {
    shared.loadShareStatus.mockResolvedValue({ communities: [PALS], sharedIn: new Set() });
    render(<Menu record={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(shared.loadShareStatus).not.toHaveBeenCalled();
  });

  it('adds nothing when the Character is in no Community', async () => {
    shared.loadShareStatus.mockResolvedValue({ communities: [], sharedIn: new Set() });
    render(<Menu />);
    await vi.waitFor(() => expect(shared.loadShareStatus).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('shares the saved copy straight to the only Community', async () => {
    shared.loadShareStatus.mockResolvedValue({ communities: [PALS], sharedIn: new Set() });
    render(<Menu />);
    await vi.waitFor(() => expect(shared.loadShareStatus).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share to Pals' }));
    expect(shared.toggleShare).toHaveBeenCalledWith(
      7,
      'c1',
      { source: 'saved', key: 'r1' },
      { name: 'Kite', code: 'CODE' },
      false
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Shared to Pals.');
  });

  it('is a submenu of Communities when there are several, naming where it already is', async () => {
    shared.loadShareStatus.mockResolvedValue({
      communities: [PALS, CREW],
      sharedIn: new Set(['c2']),
    });
    render(<Menu />);
    await vi.waitFor(() => expect(shared.loadShareStatus).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share to Community' }));
    expect(await screen.findByRole('menuitem', { name: 'Share to Pals' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Stop sharing in Crew' })).toBeInTheDocument();
  });

  it('disables sharing offline and says why, instead of letting the write fail', async () => {
    shared.loadShareStatus.mockResolvedValue({ communities: [PALS], sharedIn: new Set() });
    render(<Menu />);
    await vi.waitFor(() => expect(shared.loadShareStatus).toHaveBeenCalled());
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const item = await screen.findByRole('menuitem', { name: 'Share to Pals' });
    expect(item).toHaveAttribute('data-disabled');
    expect(screen.getByText('Sharing to a Community needs a connection.')).toBeVisible();
  });
});
