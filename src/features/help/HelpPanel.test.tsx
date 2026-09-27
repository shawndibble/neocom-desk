import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { DISCORD_URL, ISSUES_URL } from '@/lib/links';
import { HelpPanel } from './HelpPanel';

describe('HelpPanel', () => {
  it('points bug reports and feature requests at the issue tracker', () => {
    render(<HelpPanel />);

    expect(screen.getByRole('heading', { name: /report a bug or ask for a feature/i }));
    const link = screen.getByRole('link', { name: /github\.com\/shawndibble\/neocom-desk/i });
    expect(link).toHaveAttribute('href', ISSUES_URL);
    // An external link opened in this tab loses whatever the pilot was doing.
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('points to the Discord community', () => {
    render(<HelpPanel />);

    expect(screen.getByRole('heading', { name: /join the community/i })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /discord/i });
    expect(link).toHaveAttribute('href', DISCORD_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('names the pilot to thank', () => {
    render(<HelpPanel />);

    expect(screen.getByRole('heading', { name: /someone i can thank/i })).toBeInTheDocument();
    expect(screen.getByText('Mero Otichoda')).toBeInTheDocument();
    // "Welcome" and "expected" are different claims, and the copy makes both.
    expect(screen.getByText(/never expected/i)).toBeInTheDocument();
  });
});
