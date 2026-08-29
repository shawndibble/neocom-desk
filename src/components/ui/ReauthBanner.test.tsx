import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReauthBanner } from './ReauthBanner';

describe('ReauthBanner', () => {
  it('renders the title, hint, and calls onLogin when the action button is clicked', async () => {
    const onLogin = vi.fn();
    render(
      <ReauthBanner
        title="Login needed"
        hint="Log in again to see this."
        actionLabel="Log in"
        onLogin={onLogin}
      />
    );

    expect(screen.getByText('Login needed')).toBeInTheDocument();
    expect(screen.getByText('Log in again to see this.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
