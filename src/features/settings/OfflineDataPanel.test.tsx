import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { OfflineDataPanel } from './OfflineDataPanel';
import type { OfflineStatus, StorageEstimate } from './offlineStatus';

const mocks = vi.hoisted(() => ({
  readOfflineStatus: vi.fn<() => Promise<OfflineStatus>>(),
  readStorageEstimate: vi.fn<() => Promise<StorageEstimate | null>>(),
  downloadEverything: vi.fn<(onProgress: (done: number, total: number) => void) => Promise<void>>(),
  readPersisted: vi.fn<() => Promise<boolean | null>>(),
  requestPersistence: vi.fn<() => Promise<'granted' | 'denied' | 'unsupported'>>(),
}));
vi.mock('./offlineStatus', () => mocks);
vi.mock('./persistStorage', () => ({
  readPersisted: mocks.readPersisted,
  requestPersistence: mocks.requestPersistence,
}));

const PARTIAL: OfflineStatus = {
  packs: [
    { id: 'itemInfo', total: 64, cached: 40, state: 'partial' },
    { id: 'market', total: 3, cached: 3, state: 'complete' },
  ],
  engine: false,
  total: 68,
  totalCached: 43,
};
const FULL: OfflineStatus = {
  packs: [
    { id: 'itemInfo', total: 64, cached: 64, state: 'complete' },
    { id: 'market', total: 3, cached: 3, state: 'complete' },
  ],
  engine: true,
  total: 68,
  totalCached: 68,
};

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
  mocks.readOfflineStatus.mockResolvedValue(PARTIAL);
  mocks.readStorageEstimate.mockResolvedValue({ usage: 5 * 1024 ** 2, quota: 2 * 1024 ** 3 });
  mocks.readPersisted.mockResolvedValue(false);
  mocks.downloadEverything.mockResolvedValue(undefined);
  mocks.requestPersistence.mockResolvedValue('granted');
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('OfflineDataPanel status', () => {
  it('shows each pack grouped, not one row per file, plus the engine', async () => {
    render(<OfflineDataPanel />);
    expect(
      await screen.findByText('Item info (64 files): 40 of 64 downloaded')
    ).toBeInTheDocument();
    expect(screen.getByText('Market data (3 files): 3 of 3 downloaded')).toBeInTheDocument();
    expect(screen.getByText('Fitting engine: not downloaded')).toBeInTheDocument();
  });

  it('shows the storage estimate, and hides the row where it is unsupported', async () => {
    const { unmount } = render(<OfflineDataPanel />);
    expect(await screen.findByText(/5 MB of 2 GB/)).toBeInTheDocument();
    unmount();
    mocks.readStorageEstimate.mockResolvedValue(null);
    render(<OfflineDataPanel />);
    await screen.findByText(/Item info/);
    expect(screen.queryByText('Storage used')).not.toBeInTheDocument();
  });
});

describe('OfflineDataPanel persistent storage', () => {
  it('offers to protect unprotected storage, then reports it and keeps focus in the section', async () => {
    mocks.requestPersistence.mockImplementation(async () => {
      mocks.readPersisted.mockResolvedValue(true);
      return 'granted';
    });
    const user = userEvent.setup();
    render(<OfflineDataPanel />);
    await user.click(await screen.findByRole('button', { name: 'Protect this data' }));
    expect(await screen.findByText(/^Protected\./)).toBeInTheDocument();
    expect(mocks.requestPersistence).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Protect this data' })).not.toBeInTheDocument();
    expect(document.body).not.toBe(document.activeElement);
  });

  it('says so when the browser declines, and keeps the button', async () => {
    mocks.requestPersistence.mockResolvedValue('denied');
    const user = userEvent.setup();
    render(<OfflineDataPanel />);
    await user.click(await screen.findByRole('button', { name: 'Protect this data' }));
    expect(await screen.findByText(/The browser declined/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protect this data' })).toBeInTheDocument();
  });

  it('shows no button when already protected', async () => {
    mocks.readPersisted.mockResolvedValue(true);
    render(<OfflineDataPanel />);
    expect(await screen.findByText(/^Protected\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Protect this data' })).not.toBeInTheDocument();
  });
});

describe('OfflineDataPanel download', () => {
  it('shows progress, then re-reads the status and announces the result', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    mocks.downloadEverything.mockImplementation(async (onProgress) => {
      onProgress(10, 68);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    render(<OfflineDataPanel />);
    await user.click(
      await screen.findByRole('button', { name: 'Download everything for offline' })
    );
    expect(await screen.findByText('Downloading 10 of 68…')).toBeInTheDocument();

    mocks.readOfflineStatus.mockResolvedValue(FULL);
    await act(async () => finish());
    expect(
      await screen.findByText('Item info (64 files): 64 of 64 downloaded')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Everything is saved on this device.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Downloading/)).not.toBeInTheDocument();
  });

  it('reports what is still missing with a Retry that runs again and keeps focus', async () => {
    const user = userEvent.setup();
    render(<OfflineDataPanel />);
    await user.click(
      await screen.findByRole('button', { name: 'Download everything for offline' })
    );
    expect(
      (await screen.findAllByText('25 items could not be downloaded.')).length
    ).toBeGreaterThan(0);

    mocks.readOfflineStatus.mockResolvedValue(FULL);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.downloadEverything).toHaveBeenCalledTimes(2);
    expect(
      (await screen.findAllByText('Everything is saved on this device.')).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(document.body).not.toBe(document.activeElement);
  });

  it('needs a connection: aria-disabled offline, and a press does nothing', async () => {
    const user = userEvent.setup();
    render(<OfflineDataPanel />);
    const button = await screen.findByRole('button', { name: 'Download everything for offline' });
    setOnline(false);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(mocks.downloadEverything).not.toHaveBeenCalled();
  });

  it('keeps the result region mounted and empty until there is something to say', async () => {
    render(<OfflineDataPanel />);
    await screen.findByText(/Item info/);
    const regions = screen.getAllByRole('status');
    expect(regions.every((region) => region.textContent === '')).toBe(true);
  });
});
