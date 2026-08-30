import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { SCOPES } from '@/esi/scopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ScopeGate } from './ScopeGate';
import { useGrantedScopes } from './useGrantedScopes';
import type { AppRoutePath } from './routeScopes';

const CHARACTER_ID = 42;

/** Stand-in for a view's content: if this shows, the gate let the route through. */
function ViewContent() {
  return <p>Mail from Aura</p>;
}

/**
 * The gate passes children through while the Dexie read is still in flight
 * (deliberately — no spinner flash for the overwhelming majority who are fine),
 * so "no banner" is only meaningful once that read has resolved. This probe
 * makes the resolution observable, keeping the negative assertions honest.
 */
function GrantProbe() {
  const granted = useGrantedScopes();
  return (
    <p data-testid="grant">{granted === undefined ? 'pending' : `resolved:${granted.length}`}</p>
  );
}

async function seedGrant(scopes: readonly string[]): Promise<void> {
  await db.tokens.put({
    characterId: CHARACTER_ID,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
  });
}

function renderGate(path: AppRoutePath = '/mail') {
  return render(
    <MemoryRouter>
      <GrantProbe />
      <ScopeGate path={path}>
        <ViewContent />
      </ScopeGate>
    </MemoryRouter>
  );
}

/** Resolves once the granted-scope read has landed. */
async function grantResolved(): Promise<void> {
  await screen.findByText(/^resolved:/);
}

beforeEach(async () => {
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
});

describe('ScopeGate', () => {
  it('renders the view when the route’s scope is granted', async () => {
    await seedGrant(['esi-mail.read_mail.v1']);
    renderGate();
    await grantResolved();

    expect(screen.getByText('Mail from Aura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in again/i })).not.toBeInTheDocument();
  });

  it('renders the re-auth banner INSTEAD of the view when the scope is missing', async () => {
    await seedGrant(['esi-assets.read_assets.v1']);
    renderGate();

    expect(await screen.findByText(/log in again to see your mail/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /log in again with eve online/i })
    ).toBeInTheDocument();
    // The point of gating before the fetch: the view never renders, so there
    // is no spinner-then-empty-table for the user to misread.
    expect(screen.queryByText('Mail from Aura')).not.toBeInTheDocument();
  });

  it('treats a character with no stored token as granting nothing', async () => {
    renderGate();
    expect(await screen.findByText(/log in again to see your mail/i)).toBeInTheDocument();
  });

  it('shows no banner on any gated route for a character holding every scope', async () => {
    await seedGrant(SCOPES);
    for (const path of ['/assets', '/mail', '/calendar', '/contracts', '/orders'] as const) {
      const { unmount } = renderGate(path);
      await grantResolved();
      expect(screen.getByText('Mail from Aura'), path).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /log in again/i }), path).not.toBeInTheDocument();
      unmount();
    }
  });

  it('never gates an ungated route, even on an empty grant', async () => {
    await seedGrant([]);
    for (const path of ['/market', '/overview', '/skills', '/industry', '/wallet'] as const) {
      const { unmount } = renderGate(path);
      await grantResolved();
      expect(screen.getByText('Mail from Aura'), path).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /log in again/i }), path).not.toBeInTheDocument();
      unmount();
    }
  });
});
