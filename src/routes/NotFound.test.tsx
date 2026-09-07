import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { NotFound } from './NotFound';

describe('NotFound', () => {
  it('says the page is missing and offers the root URL as the way out', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /neocom desk/i })).toHaveAttribute('href', '/');
  });
});
