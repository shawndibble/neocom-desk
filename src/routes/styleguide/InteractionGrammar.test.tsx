import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { InteractionGrammar } from './InteractionGrammar';

describe('InteractionGrammar styleguide section', () => {
  it('renders each cue group with its rule name and real components', () => {
    render(
      <MemoryRouter>
        <InteractionGrammar />
      </MemoryRouter>
    );
    for (const group of [
      'Links',
      'Explain and edit',
      'Carets and openers',
      'Menus and rows',
      'States',
    ]) {
      expect(screen.getByRole('heading', { name: group })).toBeInTheDocument();
    }
    expect(screen.getByText(/Dotted underline: has a tooltip/)).toBeInTheDocument();
    // External links carry the hidden "opens in a new tab" text and a real href.
    expect(screen.getByRole('link', { name: /zKillboard/ })).toHaveAttribute('target', '_blank');
    // Entity links are real anchors.
    expect(screen.getByRole('link', { name: 'Character name' })).toHaveAttribute('href');
    // Loading buttons are aria-disabled and busy.
    expect(screen.getAllByRole('button', { name: /Saving/ })[0]).toHaveAttribute(
      'aria-busy',
      'true'
    );
    // Row menu and selected row.
    expect(screen.getByRole('button', { name: /Rifter/ })).toBeInTheDocument();
    expect(document.querySelector('[aria-current="true"]')).not.toBeNull();
  });
});
