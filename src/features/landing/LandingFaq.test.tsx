import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { LandingFaq } from './LandingFaq';
import { LANDING_FAQ } from './landingFaqEntries';

describe('LandingFaq', () => {
  it('lists 4 to 6 closed questions', () => {
    render(<LandingFaq />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(LANDING_FAQ.length);
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    expect(buttons.length).toBeLessThanOrEqual(6);
    for (const b of buttons) expect(b).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens an answer and links only to public pages', async () => {
    const user = userEvent.setup();
    render(<LandingFaq />);
    for (const { id, readMore } of LANDING_FAQ) {
      expect(
        readMore === undefined ||
          readMore.startsWith('/privacy.html') ||
          readMore.startsWith('/delete-data.html'),
        id
      ).toBe(true);
    }
    await user.click(screen.getByRole('button', { name: /is it free/i }));
    expect(screen.getByText(/the app stays free/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete my data/i }));
    expect(screen.getByRole('link', { name: /read more/i })).toHaveAttribute(
      'href',
      '/delete-data.html'
    );
  });
});
