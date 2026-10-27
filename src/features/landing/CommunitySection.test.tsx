import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { CommunitySection } from './CommunitySection';
import { LANDING_QUOTES } from './landingQuotes';

describe('CommunitySection quotes row', () => {
  it('ships with no quotes, and renders none', () => {
    expect(LANDING_QUOTES).toEqual([]);
    render(<CommunitySection />);
    expect(screen.queryAllByRole('figure')).toHaveLength(0);
  });

  it('renders a quote with its attribution once one is added', () => {
    render(
      <CommunitySection quotes={[{ text: 'Saved me a spreadsheet.', attribution: 'Test Pilot' }]} />
    );
    expect(screen.getByText('Saved me a spreadsheet.')).toBeInTheDocument();
    expect(screen.getByText('Test Pilot')).toBeInTheDocument();
  });
});
