import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { RequireCharacter } from './RequireCharacter';

/** Shows where we ended up, and what destination was preserved for later. */
function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? 'none';
  return <p>login page (from: {from})</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route element={<RequireCharacter />}>
          <Route path="/market" element={<p>market browser</p>} />
          <Route path="/characters" element={<p>character list</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.characters.clear();
});

async function addCharacter(): Promise<void> {
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
}

describe('RequireCharacter', () => {
  it('shows the boot screen while the character lookup is still in flight', () => {
    renderAt('/market');
    // Not "logged out" — redirecting here would bounce every user to /login on
    // every cold load.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(/login page/)).not.toBeInTheDocument();
  });

  it('makes a feature route unreachable with no Character', async () => {
    renderAt('/market');
    expect(await screen.findByText(/login page/)).toBeInTheDocument();
    expect(screen.queryByText('market browser')).not.toBeInTheDocument();
  });

  it('preserves the attempted destination for a later return-to flow', async () => {
    renderAt('/market');
    expect(await screen.findByText(/from: \/market/)).toBeInTheDocument();
  });

  it('lets a logged-in Character through', async () => {
    await addCharacter();
    renderAt('/market');
    expect(await screen.findByText('market browser')).toBeInTheDocument();
  });

  it('keeps /characters reachable whenever at least one Character exists', async () => {
    await addCharacter();
    renderAt('/characters');
    expect(await screen.findByText('character list')).toBeInTheDocument();
  });
});
