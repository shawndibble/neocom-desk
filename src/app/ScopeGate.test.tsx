import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { SCOPES } from '@/esi/scopes';
import { controlHeightClassName } from '@/components/ui/controlStyles';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ScopeGate } from './ScopeGate';
import { useGrantedScopes } from './useGrantedScopes';
import type { AppRoutePath } from './routeScopes';
import { seedGrant } from '@/test/seed';

vi.mock('./loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const CHARACTER_ID = 42;

function ViewContent() {
  return <p>Mail from Aura</p>;
}

function GrantProbe() {
  const granted = useGrantedScopes();
  return (
    <p data-testid="grant">{granted === undefined ? 'pending' : `resolved:${granted.length}`}</p>
  );
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

async function grantResolved(): Promise<void> {
  await screen.findByText(/^resolved:/);
}

beforeEach(async () => {
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
});

describe('ScopeGate', () => {
  it('renders the view when the route’s scope is granted', async () => {
    await seedGrant(CHARACTER_ID, ['esi-mail.read_mail.v1']);
    renderGate();
    await grantResolved();

    expect(screen.getByText('Mail from Aura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant in EVE' })).not.toBeInTheDocument();
  });

  it('renders the re-auth banner INSTEAD of the view when the scope is missing', async () => {
    await seedGrant(CHARACTER_ID, ['esi-assets.read_assets.v1']);
    renderGate();

    expect(await screen.findByText(/: grant Mail$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant in EVE' })).toBeInTheDocument();
    expect(screen.queryByText('Mail from Aura')).not.toBeInTheDocument();
  });

  it('names a locked page with an h1, which the banner’s own <p> title cannot', async () => {
    await seedGrant(CHARACTER_ID, ['esi-assets.read_assets.v1']);
    renderGate();

    expect(await screen.findByRole('heading', { level: 1, name: /mail/i })).toBeInTheDocument();
  });

  it('sizes the banner’s button at the touch tier — it is the locked route’s only control', async () => {
    await seedGrant(CHARACTER_ID, ['esi-assets.read_assets.v1']);
    renderGate();

    const login = await screen.findByRole('button', { name: 'Grant in EVE' });
    expect(login).toHaveClass(...controlHeightClassName.md.split(' '));
  });

  it('treats a character with no stored token as granting nothing', async () => {
    renderGate();
    expect(await screen.findByText(/: grant Mail$/)).toBeInTheDocument();
  });

  it('shows no banner on any gated route for a character holding every scope', async () => {
    await seedGrant(CHARACTER_ID, SCOPES);
    for (const path of ['/assets', '/mail', '/calendar'] as const) {
      const { unmount } = renderGate(path);
      await grantResolved();
      expect(screen.getByText('Mail from Aura'), path).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Grant in EVE' }), path).not.toBeInTheDocument();
      unmount();
    }
  });

  it('presses the banner asking for exactly the route’s own Permission, not the whole Base Grant (AC 1)', async () => {
    const { beginEveLogin } = await import('./loginFlow');
    await seedGrant(CHARACTER_ID, ['esi-wallet.read_character_wallet.v1']);
    const user = userEvent.setup();
    renderGate('/mail');

    await user.click(await screen.findByRole('button', { name: 'Grant in EVE' }));

    expect(beginEveLogin).toHaveBeenCalledWith({ groups: ['mail'] });
  });

  it('never gates an ungated route, even on an empty grant', async () => {
    await seedGrant(CHARACTER_ID, []);
    for (const path of [
      '/market',
      '/overview',
      '/skills',
      '/industry',
      '/wallet',
      '/contracts',
    ] as const) {
      const { unmount } = renderGate(path);
      await grantResolved();
      expect(screen.getByText('Mail from Aura'), path).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Grant in EVE' }), path).not.toBeInTheDocument();
      unmount();
    }
  });
});
