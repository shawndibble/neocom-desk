import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { scopesForGroup } from '@/esi/scopes';
import {
  PERMISSION_MARK_DISMISSALS_KEY,
  usePermissionMarkDismissalsStore,
} from '@/features/permissions/permissionMarkDismissals';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { seedCharacter, seedGrant } from '@/test/seed';
import { GrantCellMark } from './GrantCellMark';
import { beginEveLogin } from './loginFlow';

vi.mock('./loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const ACTIVE_ID = 7;
const ALT_ID = 8;
const ALT_MARK = 'Alt: Autopilot waypoints not granted';
const ACTIVE_MARK = 'Active: Autopilot waypoints not granted';

function renderMarks(ids: readonly number[] = [ALT_ID]) {
  return render(
    <MemoryRouter>
      {ids.map((id) => (
        <GrantCellMark key={id} characterId={id} permission="autopilot" why="Sets the route" />
      ))}
    </MemoryRouter>
  );
}

beforeEach(async () => {
  vi.mocked(beginEveLogin).mockClear();
  useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: true });
  await seedCharacter(ACTIVE_ID, 'Active');
  await seedCharacter(ALT_ID, 'Alt');
  await seedGrant(ACTIVE_ID, []);
  await seedGrant(ALT_ID, []);
});

afterEach(async () => {
  await usePermissionMarkDismissalsStore.getState().setValue([]);
  await db.settings.clear();
  await db.tokens.clear();
  await db.characters.clear();
});

describe('GrantCellMark', () => {
  it('grants for the row’s Character, not the active one', async () => {
    const user = userEvent.setup();
    renderMarks();
    await user.click(await screen.findByRole('button', { name: ALT_MARK }));

    expect(await screen.findByText('Alt: grant Autopilot waypoints')).toBeInTheDocument();
    expect(screen.getByText('Sets the route')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grant in EVE' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: ALT_ID, groups: ['autopilot'] });
  });

  it('renders nothing once the Character holds the Permission', async () => {
    await seedGrant(ALT_ID, [...scopesForGroup('autopilot')]);
    renderMarks([ALT_ID, ACTIVE_ID]);
    await screen.findByRole('button', { name: ACTIVE_MARK });
    expect(screen.queryByRole('button', { name: ALT_MARK })).toBeNull();
  });

  it('names the Permission an endpoint needs', async () => {
    render(
      <MemoryRouter>
        <GrantCellMark characterId={ALT_ID} endpoints={['getCharacterStandings']} />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole('button', { name: 'Alt: Character details not granted' })
    ).toBeInTheDocument();
  });

  it('Don’t ask again silences every Character’s mark and syncs the choice', async () => {
    const user = userEvent.setup();
    renderMarks([ALT_ID, ACTIVE_ID]);
    await user.click(await screen.findByRole('button', { name: ALT_MARK }));
    await user.click(await screen.findByRole('button', { name: "Don't ask again" }));

    await waitFor(() => expect(screen.queryByRole('button', { name: ALT_MARK })).toBeNull());
    expect(screen.queryByRole('button', { name: ACTIVE_MARK })).toBeNull();
    expect((await db.settings.get(PERMISSION_MARK_DISMISSALS_KEY))?.value).toEqual(['autopilot']);
  });

  it('stays dismissed for a Character added later, from the stored setting', async () => {
    await db.settings.put({ key: PERMISSION_MARK_DISMISSALS_KEY, value: ['autopilot'] });
    await usePermissionMarkDismissalsStore.getState().setValue(['autopilot']);
    await seedCharacter(9, 'New');
    await seedGrant(9, []);
    render(
      <MemoryRouter>
        <GrantCellMark characterId={9} permission="autopilot" />
        <GrantCellMark characterId={9} endpoints={['getCharacterStandings']} />
      </MemoryRouter>
    );
    await screen.findByRole('button', { name: 'New: Character details not granted' });
    expect(
      screen.queryByRole('button', { name: 'New: Autopilot waypoints not granted' })
    ).toBeNull();
  });
});
