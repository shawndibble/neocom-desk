import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { NavItem } from './NavItem';

describe('NavItem attention dot', () => {
  it.each(['rail', 'tab', 'tile'] as const)(
    'names the waiting attention in the %s link, and draws the dot',
    (presentation) => {
      render(
        <MemoryRouter>
          <NavItem
            to="/settings"
            label="Settings"
            locked={false}
            attention
            presentation={presentation}
          />
        </MemoryRouter>
      );
      const link = screen.getByRole('link', { name: 'Settings, needs attention' });
      expect(link.querySelector('[data-attention-dot]')).not.toBeNull();
    }
  );

  it('draws nothing without attention', () => {
    render(
      <MemoryRouter>
        <NavItem to="/settings" label="Settings" locked={false} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link.querySelector('[data-attention-dot]')).toBeNull();
  });
});
