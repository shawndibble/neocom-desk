import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { AlertCharacterSwitch } from './AlertCharacterSwitch';

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AlertCharacterSwitch />
      <Where />
    </MemoryRouter>
  );
}

describe('AlertCharacterSwitch', () => {
  beforeEach(async () => {
    await db.characters.clear();
    await db.characters.bulkPut([
      { characterId: 1, name: 'Main' },
      { characterId: 2, name: 'Alt Indy' },
    ] as never);
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  });

  it('switches to the alerted Character, says so, and strips the param', async () => {
    renderAt('/industry?highlight=9&character=2');

    expect(await screen.findByRole('status')).toHaveTextContent('Switched to Alt Indy');
    expect(useActiveCharacter.getState().activeCharacterId).toBe(2);
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/industry?highlight=9')
    );
    expect(screen.getByTestId('where').textContent).not.toContain('character=');
  });

  it('does nothing extra for the already-active Character', async () => {
    renderAt('/mail?character=1');

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/mail$/));
    expect(screen.queryByRole('status')).toBeNull();
    expect(useActiveCharacter.getState().activeCharacterId).toBe(1);
  });

  it('ignores a Character that is no longer on the device', async () => {
    renderAt('/mail?character=99');

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/mail$/));
    expect(screen.queryByRole('status')).toBeNull();
    expect(useActiveCharacter.getState().activeCharacterId).toBe(1);
  });
});
