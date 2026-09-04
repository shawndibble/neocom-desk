import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { NotificationContextMenu } from './NotificationContextMenu';
import { useNotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from './preferences';
import type { NotificationFeedRecord } from '@/db';

const setSyncedSettingMock = vi
  .fn<(key: string, value: unknown) => Promise<void>>()
  .mockResolvedValue(undefined);
const scheduleSyncMock = vi.fn<(characterId: number) => void>();
vi.mock('@/sync', () => ({
  setSyncedSetting: (key: string, value: unknown) => setSyncedSettingMock(key, value),
  scheduleSync: (characterId: number) => scheduleSyncMock(characterId),
}));

const CHARACTER_ID = 1;

function entry(overrides: Partial<NotificationFeedRecord> = {}): NotificationFeedRecord {
  return {
    id: 'entry-1',
    characterId: CHARACTER_ID,
    eventId: 'newMail',
    title: 'New mail',
    body: 'You have new mail',
    firedAt: 1000,
    ...overrides,
  };
}

function renderMenu(record: NotificationFeedRecord) {
  return render(
    <NotificationContextMenu entry={record}>
      <button type="button">{record.title}</button>
    </NotificationContextMenu>
  );
}

beforeEach(async () => {
  await db.characters.clear();
  await db.characters.bulkPut([
    { characterId: CHARACTER_ID, name: 'Active Pilot', ownerHash: 'h1', addedAt: 0 },
  ]);
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
  setSyncedSettingMock.mockClear();
  scheduleSyncMock.mockClear();
});

describe('NotificationContextMenu', () => {
  it('opens on right-click with both items, browser channel reading its default-on state', async () => {
    renderMenu(entry());
    fireEvent.contextMenu(screen.getByRole('button', { name: 'New mail' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Turn off browser notifications' })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Hide in feed' })).toBeInTheDocument();
  });

  it('toggles the browser channel for the row event without syncing', async () => {
    renderMenu(entry());
    fireEvent.contextMenu(screen.getByRole('button', { name: 'New mail' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Turn off browser notifications' })
    );

    await waitFor(() =>
      expect(useNotificationPreferences.getState().value.perCharacter[CHARACTER_ID]).toEqual({
        newMail: { browser: false, feed: true },
      })
    );
    expect(setSyncedSettingMock).not.toHaveBeenCalled();
    expect(scheduleSyncMock).not.toHaveBeenCalled();
  });

  it("hides the row's event type in the feed and syncs the change", async () => {
    renderMenu(entry());
    fireEvent.contextMenu(screen.getByRole('button', { name: 'New mail' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide in feed' }));

    await waitFor(() => expect(scheduleSyncMock).toHaveBeenCalledWith(CHARACTER_ID));
    expect(setSyncedSettingMock).toHaveBeenCalledTimes(1);
    expect(useNotificationPreferences.getState().value.perCharacter[CHARACTER_ID]).toEqual({
      newMail: { browser: true, feed: false },
    });
  });

  it('reads the eveType-scoped toggle for an eveNotification row, not the parent event', async () => {
    renderMenu(
      entry({ id: 'entry-2', eventId: 'eveNotification', eveType: 'MoonminingExtractionFinished' })
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'New mail' }));

    // MoonminingExtractionFinished defaults browser-off (EVE_TYPE_DEFAULT), unlike newMail.
    expect(
      await screen.findByRole('menuitem', { name: 'Turn on browser notifications' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Turn on browser notifications' }));

    await waitFor(() =>
      expect(
        useNotificationPreferences.getState().value.eveNotificationTypesByCharacter?.[CHARACTER_ID]
      ).toEqual({
        MoonminingExtractionFinished: { browser: true, feed: true },
      })
    );
  });

  it('reads the affected character from the row itself, never from the rendered text', async () => {
    renderMenu(entry({ characterId: 2, title: 'Someone else entirely' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Someone else entirely' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide in feed' }));

    await waitFor(() =>
      expect(useNotificationPreferences.getState().value.perCharacter[2]).toEqual({
        newMail: { browser: true, feed: false },
      })
    );
    expect(useNotificationPreferences.getState().value.perCharacter[CHARACTER_ID]).toBeUndefined();
  });
});
