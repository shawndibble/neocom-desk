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

describe('OfflineBanner', () => {
  it('renders nothing visible while online', () => {
    go(true);
    render(<OfflineBanner />);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the message when offline and announces it politely through one status region', async () => {
    go(false);
    render(<OfflineBanner />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
    // The visible text has no role; the single live region carries the announcement.
    const region = screen.getByRole('status');
    await waitFor(() => expect(region).toHaveTextContent(TEXT));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('appears when the connection drops and disappears when it returns', async () => {
    go(true);
    render(<OfflineBanner />);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();

    act(() => go(false));
    expect(await screen.findByText(TEXT)).toBeInTheDocument();

    act(() => go(true));
    await waitFor(() => expect(screen.queryByText(TEXT)).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
