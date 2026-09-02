import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { OverviewSubNav } from './OverviewSubNav';

const CHARACTER_ID = 77;

async function seedGrant(scopes: readonly string[]): Promise<void> {
  await db.tokens.put({
    characterId: CHARACTER_ID,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
  });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
}

function renderSubNav(at = '/overview') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <OverviewSubNav />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  await db.tokens.clear();
});

describe('OverviewSubNav', () => {
  it('links the three Overview views, in order, at their unchanged top-level paths', () => {
    renderSubNav();

    const nav = screen.getByRole('navigation', { name: 'Overview' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Overview',
      'Clones',
      'Employment History',
    ]);
    // The tabs group these views visually; they are not re-parented under
    // /overview, so every existing bookmark and shortcut still resolves.
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/overview',
      '/clones',
      '/employment-history',
    ]);
  });

  it('marks the current view as the active tab', () => {
    renderSubNav('/clones');

    const nav = screen.getByRole('navigation', { name: 'Overview' });
    expect(within(nav).getByRole('link', { name: 'Clones' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('carries the rail’s missing-scope marker onto Clones, the one gated tab', async () => {
    await seedGrant([]);
    renderSubNav();

    const nav = screen.getByRole('navigation', { name: 'Overview' });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Clones' })).toHaveAttribute(
        'title',
        'Needs a new login'
      )
    );
    // Informational only, exactly as in the rail — the link still navigates
    // and /clones' ScopeGate is where the explanation lives.
    expect(within(nav).getByRole('link', { name: 'Clones' })).toHaveAttribute('href', '/clones');
  });

  it('leaves Clones unmarked once its scope is granted, and never marks the ungated tabs', async () => {
    await seedGrant(['esi-clones.read_clones.v1']);
    renderSubNav();

    const nav = screen.getByRole('navigation', { name: 'Overview' });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Clones' })).not.toHaveAttribute('title')
    );
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('title');
    expect(within(nav).getByRole('link', { name: 'Employment History' })).not.toHaveAttribute(
      'title'
    );
  });
});
