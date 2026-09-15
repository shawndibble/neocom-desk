import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LpStoreLink } from './LpStoreLink';

describe('LpStoreLink', () => {
  it("links to the corp's LP Store page", () => {
    render(
      <MemoryRouter>
        <LpStoreLink corporationId={1000125} label="850,000 ISK + 400,000 LP (Sisters of EVE)" />
      </MemoryRouter>
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/wallet/loyalty/1000125');
  });

  it('names the link after the full breakdown, so it is never announced as just "link"', () => {
    render(
      <MemoryRouter>
        <LpStoreLink corporationId={1000125} label="850,000 ISK + 400,000 LP (Sisters of EVE)" />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('link', { name: '850,000 ISK + 400,000 LP (Sisters of EVE)' })
    ).toBeInTheDocument();
  });

  it('hides the glyph from assistive tech — the label is the accessible name', () => {
    render(
      <MemoryRouter>
        <LpStoreLink corporationId={1000125} label="850,000 ISK + 400,000 LP (Sisters of EVE)" />
      </MemoryRouter>
    );
    const link = screen.getByRole('link');
    expect(link.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('exposes the same text as a tooltip', () => {
    render(
      <MemoryRouter>
        <LpStoreLink corporationId={1000125} label="850,000 ISK + 400,000 LP (Sisters of EVE)" />
      </MemoryRouter>
    );
    fireEvent.focus(screen.getByRole('link'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '850,000 ISK + 400,000 LP (Sisters of EVE)'
    );
  });
});
