import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { OfflineBanner } from './OfflineBanner';

const TEXT = "You're offline — showing data saved on this device. Changes sync when you reconnect.";

function go(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

// Once the live region fills, the same sentence is in the DOM twice (the sr-only
// announcement and the visible strip), so the text alone is not a query: the
// strip is found by its test id, the announcement by its role.
const strip = () => screen.queryByTestId('offline-banner');

describe('OfflineBanner', () => {
  it('renders nothing visible while online', () => {
    go(true);
    render(<OfflineBanner />);
    expect(strip()).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the message when offline and announces it politely through one status region', async () => {
    go(false);
    render(<OfflineBanner />);
    expect(strip()).toHaveTextContent(TEXT);
    // The visible text has no role; the single live region carries the announcement.
    const region = screen.getByRole('status');
    await waitFor(() => expect(region).toHaveTextContent(TEXT));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(strip()?.closest('[role="status"]')).toBeNull();
  });

  it('appears when the connection drops and disappears when it returns', async () => {
    go(true);
    render(<OfflineBanner />);
    expect(strip()).not.toBeInTheDocument();
    const region = screen.getByRole('status');

    act(() => go(false));
    expect(await screen.findByTestId('offline-banner')).toHaveTextContent(TEXT);
    // The live region that announces it was already mounted: same node, filled.
    expect(screen.getByRole('status')).toBe(region);
    await waitFor(() => expect(region).toHaveTextContent(TEXT));

    act(() => go(true));
    await waitFor(() => expect(strip()).not.toBeInTheDocument());
    await waitFor(() => expect(region).toBeEmptyDOMElement());
  });
});
