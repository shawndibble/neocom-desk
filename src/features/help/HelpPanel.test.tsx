import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { DISCORD_URL, REPO_URL } from '@/lib/links';
import { HelpPanel } from './HelpPanel';

describe('HelpPanel', () => {
  it('points bug reports, feature requests, and discussion at Discord', () => {
    render(<HelpPanel />);

    expect(
      screen.getByRole('heading', { name: /report a bug, ask for a feature, or just chat/i })
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /discord/i });
    expect(link).toHaveAttribute('href', DISCORD_URL);
    // An external link opened in this tab loses whatever the pilot was doing.
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('points to GitHub for the source or a pull request, not for filing anything', () => {
    render(<HelpPanel />);

    expect(
      screen.getByRole('heading', { name: /see the code, or add something yourself/i })
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /github\.com\/shawndibble\/neocom-desk/i });
    expect(link).toHaveAttribute('href', REPO_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/not for bug reports or feature requests/i)).toBeInTheDocument();
  });

  it('names the pilot to thank', () => {
    render(<HelpPanel />);

    expect(screen.getByRole('heading', { name: /someone i can thank/i })).toBeInTheDocument();
    expect(screen.getByText('Mero Otichoda')).toBeInTheDocument();
    // "Welcome" and "expected" are different claims, and the copy makes both.
    expect(screen.getByText(/never expected/i)).toBeInTheDocument();
  });
});
