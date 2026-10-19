import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { viewedCharacterIdFromSearch } from './viewedCharacter';
import { WalletOriginCrumb } from './WalletOriginCrumb';

describe('viewedCharacterIdFromSearch', () => {
  it('reads ?char= and the legacy ?chars= single ids', () => {
    expect(viewedCharacterIdFromSearch('?char=92')).toBe(92);
    expect(viewedCharacterIdFromSearch('?chars=92')).toBe(92);
  });

  it('prefers the canonical key over an alias', () => {
    expect(viewedCharacterIdFromSearch('?chars=5&char=92')).toBe(92);
  });

  it('leaves the current/all filter keywords and junk alone', () => {
    for (const search of [
      '',
      '?chars=all',
      '?char=current',
      '?chars=1,2',
      '?char=abc',
      '?char=0',
    ]) {
      expect(viewedCharacterIdFromSearch(search)).toBeNull();
    }
  });
});

describe('WalletOriginCrumb', () => {
  it('renders only when route state names the Wallet as origin', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={[{ pathname: '/assets', state: { origin: 'wallet' } }]}>
        <WalletOriginCrumb />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Wallet/ })).toHaveAttribute('href', '/wallet');
    unmount();
    render(
      <MemoryRouter initialEntries={['/assets']}>
        <WalletOriginCrumb />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
