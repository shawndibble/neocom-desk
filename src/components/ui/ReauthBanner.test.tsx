import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReauthBanner } from './ReauthBanner';
import { controlHeightClassName } from './controlStyles';

/** The height utilities a tier puts on the control, as `toHaveClass` args. */
function heightClasses(tier: 'sm' | 'md'): string[] {
  return controlHeightClassName[tier].split(' ');
}

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

  it('sizes its action at the compact tier by default', () => {
    render(
      <ReauthBanner title="Login needed" hint="Hint." actionLabel="Log in" onLogin={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: 'Log in' })).toHaveClass(...heightClasses('sm'));
  });

  it('sizes its action at the touch tier when it is the view’s only action', () => {
    render(
      <ReauthBanner
        title="Login needed"
        hint="Hint."
        actionLabel="Log in"
        onLogin={vi.fn()}
        soleAction
      />
    );

    expect(screen.getByRole('button', { name: 'Log in' })).toHaveClass(...heightClasses('md'));
  });
});
