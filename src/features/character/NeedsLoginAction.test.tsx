import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { useNeedsLogin } from '@/stores/authFailure';
import { beginEveLogin } from '@/app/loginFlow';
import { NeedsLoginAction } from './NeedsLoginAction';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn(async () => {}) }));

beforeEach(() => {
  vi.mocked(beginEveLogin).mockClear();
  useNeedsLogin.setState({ value: [], hydrated: true });
});

describe('NeedsLoginAction', () => {
  it('shows nothing for a character whose login works', () => {
    useNeedsLogin.setState({ value: [8], hydrated: true });
    render(<NeedsLoginAction characterId={7} name="Ada Vance" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a re-login for that character when its login is dead', async () => {
    useNeedsLogin.setState({ value: [7], hydrated: true });
    render(<NeedsLoginAction characterId={7} name="Ada Vance" />);
    const button = screen.getByRole('button', { name: 'Sign in again as Ada Vance' });
    expect(button).toHaveTextContent('Sign in again');
    await userEvent.click(button);
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: 7 });
  });
});
