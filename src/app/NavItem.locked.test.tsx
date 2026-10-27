import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { NavItem } from './NavItem';

describe('NavItem locked', () => {
  it('keeps the rail row styles under the Tooltip wrapper', () => {
    render(
      <MemoryRouter>
        <NavItem to="/mining" label="Mining" locked />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Mining' });
    expect(link.className).toContain('uppercase');
    expect(link.className).not.toContain('=>');
  });
});
