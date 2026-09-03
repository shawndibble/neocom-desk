import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { SCOPES } from '@/esi/scopes';
import { assignLocation } from '@/app/navigation';
import { Login } from './Login';

vi.mock('@/app/navigation', () => ({ assignLocation: vi.fn() }));

beforeEach(() => {
  vi.mocked(assignLocation).mockClear();
  vi.stubEnv('VITE_EVE_CLIENT_ID', 'test-client-id');
  sessionStorage.clear();
});

describe('Login', () => {
  it('shows the app name, hero heading and SSO button', () => {
    render(<Login />);
    expect(screen.getByText('NeoCom Desk')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /command deck for every character you fly/i })
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /log in with eve online/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('builds a PKCE authorize URL and navigates to EVE SSO', async () => {
    const user = userEvent.setup();
    render(<Login />);
    const [firstButton] = screen.getAllByRole('button', { name: /log in with eve online/i });
    await user.click(firstButton);

    await waitFor(() => expect(assignLocation).toHaveBeenCalledTimes(1));
    const url = new URL(vi.mocked(assignLocation).mock.calls[0][0]);

    expect(url.origin).toBe('https://login.eveonline.com');
    expect(url.pathname).toBe('/v2/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/callback$/);
  });
});
