import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { StartLinkHelp } from './StartLinkHelp';
import { ShortLinkLimited } from './shortStartLink';

const makeShortLink = vi.hoisted(() => vi.fn());
vi.mock('./shortStartLink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shortStartLink')>()),
  makeShortLink,
}));

beforeEach(() => {
  makeShortLink.mockReset();
});
afterEach(cleanup);

describe('StartLinkHelp', () => {
  it('shows a made-up example, with no short link button, when nothing is filled in', () => {
    render(<StartLinkHelp />);
    expect(screen.getByText(/place=Efa/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make short link' })).toBeNull();
  });

  it('shows the link built from the details and swaps it for the short one on request', async () => {
    makeShortLink.mockResolvedValue('https://neocomdesk.test/s/xk3p9q');
    const { rerender } = render(<StartLinkHelp path="/survey?placeId=7&rate=5" />);
    expect(screen.getByText(/survey\?placeId=7&rate=5/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make short link' }));
    expect(await screen.findByText('https://neocomdesk.test/s/xk3p9q')).toBeTruthy();
    expect(makeShortLink).toHaveBeenCalledWith('/survey?placeId=7&rate=5');
    expect(screen.queryByRole('button', { name: 'Make short link' })).toBeNull();
    // A change to the details makes the short link stale: the long link is back.
    rerender(<StartLinkHelp path="/survey?placeId=7&rate=6" />);
    expect(screen.getByRole('button', { name: 'Make short link' })).toBeTruthy();
  });

  it('says so when the short link could not be made', async () => {
    makeShortLink.mockRejectedValue(new Error('down'));
    render(<StartLinkHelp path="/survey?rate=5" />);
    fireEvent.click(screen.getByRole('button', { name: 'Make short link' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('says how long to wait when the service asks it to slow down', async () => {
    makeShortLink.mockRejectedValue(new ShortLinkLimited(20));
    render(<StartLinkHelp path="/survey?rate=5" />);
    fireEvent.click(screen.getByRole('button', { name: 'Make short link' }));
    expect(await screen.findByText(/Try again in 20 seconds/)).toBeTruthy();
  });

  it('documents the POST and GET calls with the endpoint', () => {
    render(<StartLinkHelp />);
    expect(screen.getAllByText(/api\.neocomdesk\.com\/short/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('cloudfunctions.net');
  });
});
