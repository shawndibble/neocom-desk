import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { SCOPE_GROUPS } from '@/esi/registry';
import { scopesForGroup } from '@/esi/scopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { seedCharacter, seedGrant } from '@/test/seed';
import { CharacterPermissionStrip } from './CharacterPermissionStrip';

const TOTAL = SCOPE_GROUPS.length;
const allScopes = SCOPE_GROUPS.flatMap((group) => [...scopesForGroup(group)]);

/** A Character granting the first `n` Permissions. */
async function seed(id: number, name: string, n: number) {
  await seedCharacter(id, name, { addedAt: id });
  await seedGrant(
    id,
    SCOPE_GROUPS.slice(0, n).flatMap((group) => [...scopesForGroup(group)])
  );
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});

describe('CharacterPermissionStrip', () => {
  it('renders nothing for a single Character', async () => {
    await seed(1, 'Solo', 3);
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
    const { container } = render(<CharacterPermissionStrip />);
    await waitFor(() => expect(db.characters.count()).resolves.toBe(1));
    expect(container).toBeEmptyDOMElement();
  });

  describe('up to four Characters', () => {
    beforeEach(async () => {
      await seed(1, 'Aria', TOTAL);
      await seed(2, 'Kestrel', 3);
      useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true });
    });

    it('is one chip per Character with its count and what it is missing', async () => {
      render(<CharacterPermissionStrip />);
      const aria = await screen.findByRole('button', { name: /Aria/ });
      expect(aria).toHaveTextContent(`${TOTAL} of ${TOTAL}`);
      expect(aria).not.toHaveTextContent('missing');
      const kestrel = screen.getByRole('button', { name: /Kestrel/ });
      expect(kestrel).toHaveTextContent(`3 of ${TOTAL}`);
      expect(kestrel).toHaveTextContent(`${TOTAL - 3} missing`);
      expect(kestrel).toHaveAttribute('aria-pressed', 'true');
      expect(aria).toHaveAttribute('aria-pressed', 'false');
    });

    it('switches the active Character when a chip is pressed', async () => {
      render(<CharacterPermissionStrip />);
      await userEvent.click(await screen.findByRole('button', { name: /Aria/ }));
      await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(1));
    });
  });

  describe('more than four Characters', () => {
    beforeEach(async () => {
      await seed(1, 'Aria', TOTAL);
      await seed(2, 'Bram', 2);
      await seed(3, 'Cato', 9);
      await seed(4, 'Dax', TOTAL);
      await seed(5, 'Esme', 5);
      useActiveCharacter.setState({ activeCharacterId: 3, hydrated: true });
    });

    it('is a picker whose trigger names the active Character and its count', async () => {
      render(<CharacterPermissionStrip />);
      const trigger = await screen.findByRole('button', { name: /Cato/ });
      expect(trigger).toHaveTextContent('9 of');
      expect(screen.queryByRole('button', { name: /Aria/ })).not.toBeInTheDocument();
    });

    it('groups Characters that need Permissions first, fewest granted first', async () => {
      render(<CharacterPermissionStrip />);
      await userEvent.click(await screen.findByRole('button', { name: /Cato/ }));
      const list = await screen.findByRole('dialog');
      const needs = within(list).getByRole('group', { name: /Needs permissions/ });
      expect(
        within(needs)
          .getAllByRole('button')
          .map((b) => b.textContent)
      ).toEqual([
        expect.stringContaining('Bram'),
        expect.stringContaining('Esme'),
        expect.stringContaining('Cato'),
      ]);
      const done = within(list).getByRole('group', { name: /All granted/ });
      expect(within(done).getAllByRole('button')).toHaveLength(2);
    });

    it('narrows by name and switches the active Character on pick', async () => {
      render(<CharacterPermissionStrip />);
      await userEvent.click(await screen.findByRole('button', { name: /Cato/ }));
      await userEvent.type(screen.getByRole('searchbox'), 'es');
      expect(screen.queryByRole('button', { name: /Bram/ })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /Esme/ }));
      await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(5));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('says so when the search matches nobody', async () => {
      render(<CharacterPermissionStrip />);
      await userEvent.click(await screen.findByRole('button', { name: /Cato/ }));
      await userEvent.type(screen.getByRole('searchbox'), 'zzz');
      expect(screen.getByText('No characters match.')).toBeInTheDocument();
    });
  });

  it('counts a Character with no token as granting nothing', async () => {
    await seedCharacter(1, 'Aria', { addedAt: 1 });
    await seed(2, 'Bram', allScopes.length);
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
    render(<CharacterPermissionStrip />);
    expect(await screen.findByRole('button', { name: /Aria/ })).toHaveTextContent(`0 of ${TOTAL}`);
  });
});
