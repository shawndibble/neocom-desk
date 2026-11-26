import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { InteractionGrammar } from './InteractionGrammar';

describe('InteractionGrammar', () => {
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
    const rules = Object.values(en.interactionGrammar.rules);
    expect(rules.length).toBeGreaterThan(20);
    for (const rule of rules) expect(screen.getAllByText(rule).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /zKillboard/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Character name' })).toHaveAttribute('href');
    expect(screen.getAllByRole('button', { name: /Saving/ })[0]).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('button', { name: /Rifter/ })).toBeInTheDocument();
    expect(document.querySelector('[aria-current="true"]')).not.toBeNull();
  });
});
