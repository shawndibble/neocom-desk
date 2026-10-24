import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { OfflineDataPanel } from './OfflineDataPanel';
import { useStorageAtRisk } from './storageAtRisk';
import type { DownloadOutcome, OfflineStatus, StorageEstimate } from './offlineStatus';

const mocks = vi.hoisted(() => ({
  readOfflineStatus: vi.fn<() => Promise<OfflineStatus>>(),
  readStorageEstimate: vi.fn<() => Promise<StorageEstimate | null>>(),
  downloadEverything:
    vi.fn<(onProgress: (done: number, total: number) => void) => Promise<DownloadOutcome>>(),
  cancelDownload: vi.fn(),
  readPersisted: vi.fn<() => Promise<boolean | null>>(),
  requestPersistence: vi.fn<() => Promise<'granted' | 'denied' | 'unsupported'>>(),
}));
vi.mock('./offlineStatus', () => mocks);
vi.mock('@/lib/persistStorage', () => ({
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
  mocks.downloadEverything.mockResolvedValue('done');
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
    // The button is gone: focus is on the section that held it, not <body>.
    const section = screen.getByText(/^Protected\./).parentElement;
    await waitFor(() => expect(section).toHaveFocus());
  });

  it('says so when the browser declines, and keeps the button', async () => {
    mocks.requestPersistence.mockResolvedValue('denied');
    const user = userEvent.setup();
    render(<OfflineDataPanel />);
    await user.click(await screen.findByRole('button', { name: 'Protect this data' }));
    await waitFor(() => expect(screen.getAllByText(/The browser declined/)).toHaveLength(2)); // note + live region
    expect(screen.getByRole('button', { name: 'Protect this data' })).toBeInTheDocument();
  });

  it('clears the Settings attention dot once the browser grants it', async () => {
    useStorageAtRisk.setState({ atRisk: true });
    mocks.requestPersistence.mockImplementation(async () => {
      mocks.readPersisted.mockResolvedValue(true);
      return 'granted';
    });
    const user = userEvent.setup();
    render(<OfflineDataPanel />);
    await user.click(await screen.findByRole('button', { name: 'Protect this data' }));
    await waitFor(() => expect(useStorageAtRisk.getState().atRisk).toBe(false));
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
      return 'done';
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
    const downloadSection = screen.getByRole('button', {
      name: 'Download everything for offline',
    }).parentElement?.parentElement;
    await waitFor(() => expect(downloadSection).toHaveFocus());
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

describe('OfflineDataPanel download edge cases', () => {
  const liveRegion = () => screen.getAllByRole('status')[0];

  it('says "Connect to download." beside the dimmed button while offline', async () => {
    render(<OfflineDataPanel />);
    await screen.findByText(/Item info/);
    expect(screen.queryByText('Connect to download.')).not.toBeInTheDocument();
    setOnline(false);
    expect(await screen.findByText('Connect to download.')).toBeVisible();
  });

  it('announces the start of a download', async () => {
    const user = userEvent.setup();
    mocks.downloadEverything.mockImplementation(() => new Promise(() => {}));
    render(<OfflineDataPanel />);
    await user.click(
      await screen.findByRole('button', { name: 'Download everything for offline' })
    );
    await waitFor(() => expect(within(liveRegion()).getByText('Downloading…')).toBeInTheDocument());
  });

  it('with no controlling service worker says to reload, and offers no Retry', async () => {
    const user = userEvent.setup();
    mocks.downloadEverything.mockResolvedValue('no-service-worker');
    render(<OfflineDataPanel />);
    await user.click(
      await screen.findByRole('button', { name: 'Download everything for offline' })
    );
    expect(
      (await screen.findAllByText('Reload the app once to enable offline downloads.')).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be downloaded/)).not.toBeInTheDocument();
  });

  it('cancels a running download, reports it, and keeps focus in the section', async () => {
    const user = userEvent.setup();
    let finish: (outcome: DownloadOutcome) => void = () => {};
    mocks.downloadEverything.mockImplementation(
      (onProgress) =>
        new Promise<DownloadOutcome>((resolve) => {
          onProgress(2, 68);
          finish = resolve;
        })
    );
    render(<OfflineDataPanel />);
    await user.click(
      await screen.findByRole('button', { name: 'Download everything for offline' })
    );
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(mocks.cancelDownload).toHaveBeenCalledOnce();
    await act(async () => finish('cancelled'));
    expect((await screen.findAllByText('Download cancelled.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    const section = screen.getByRole('button', { name: 'Download everything for offline' })
      .parentElement?.parentElement;
    await waitFor(() => expect(section).toHaveFocus());
  });

  it('stops the download when the panel unmounts', async () => {
    const { unmount } = render(<OfflineDataPanel />);
    await screen.findByText(/Item info/);
    unmount();
    expect(mocks.cancelDownload).toHaveBeenCalled();
  });

  it('refreshes the pack lines while files land, not only at the end', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    mocks.downloadEverything.mockImplementation(async (onProgress) => {
      onProgress(8, 68);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return 'done';
    });
    render(<OfflineDataPanel />);
    await screen.findByText(/Item info/);
    const before = mocks.readOfflineStatus.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Download everything for offline' }));
    await waitFor(() => expect(mocks.readOfflineStatus.mock.calls.length).toBeGreaterThan(before));
    await act(async () => finish());
  });
});
