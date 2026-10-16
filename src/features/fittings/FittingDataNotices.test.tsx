import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';

const engine = vi.hoisted(() => ({ loadDogmaEngine: vi.fn() }));
vi.mock('./dogmaFittingEngine', () => ({ loadDogmaEngine: engine.loadDogmaEngine }));
const catalogue = vi.hoisted(() => ({ failed: { value: false }, retry: vi.fn() }));
vi.mock('./useFittingCatalogue', () => ({
  useFittingCatalogueFailed: () => catalogue.failed.value,
  retryFittingCatalogue: catalogue.retry,
}));

import { CatalogueLoadingNote, ShipDataWaitingNote } from './FittingDataNotices';
import { setDogmaEngineStatus } from './dogmaEngineStatus';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
  engine.loadDogmaEngine.mockResolvedValue({});
  catalogue.failed.value = false;
  setOnline(true);
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
  setDogmaEngineStatus('idle');
  vi.clearAllMocks();
});

describe('ShipDataWaitingNote', () => {
  it('says it is downloading while it is', () => {
    setDogmaEngineStatus('loading');
    render(<ShipDataWaitingNote />);
    expect(screen.getByText(/Ship data is still downloading/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offline and failed: the one-time download copy, never "still downloading"', () => {
    setOnline(false);
    setDogmaEngineStatus('failed');
    render(<ShipDataWaitingNote />);
    expect(screen.getByRole('alert').textContent).toContain(
      'Fitting stats need a one-time ~10 MB download. Connect once to enable them.'
    );
    expect(screen.queryByText(/still downloading/)).toBeNull();
  });

  it('online and failed: says it failed, and Retry loads the engine again', () => {
    setDogmaEngineStatus('failed');
    render(<ShipDataWaitingNote />);
    expect(screen.getByText("Couldn't download the ship data.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(engine.loadDogmaEngine).toHaveBeenCalledTimes(1);
  });

  it('loads the engine again by itself when the connection returns', () => {
    setOnline(false);
    setDogmaEngineStatus('failed');
    render(<ShipDataWaitingNote />);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(engine.loadDogmaEngine).toHaveBeenCalledTimes(1);
  });
});

describe('CatalogueLoadingNote', () => {
  it('says "Loading items…" until the load has failed', () => {
    render(<CatalogueLoadingNote />);
    expect(screen.getByText('Loading items…')).toBeTruthy();
  });

  it('offline and failed: the not-downloaded-yet copy with Retry', () => {
    setOnline(false);
    catalogue.failed.value = true;
    render(<CatalogueLoadingNote />);
    expect(screen.getByRole('alert').textContent).toContain(
      "Item data isn't downloaded on this device yet. Connect once to use the fitting editor."
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(catalogue.retry).toHaveBeenCalledTimes(1);
  });
});
