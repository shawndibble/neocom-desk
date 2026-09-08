/**
 * The Alerts page, which is where every fired notification actually lives now.
 *
 * The paths worth guarding are the ones with no counterpart anywhere else in
 * the app: grouping hundreds of fires into a dozen type rows, showing a type
 * that has been muted (nothing else does — `NotificationContextMenu`'s own
 * mute is one-way from a row that vanishes as it applies), and setting that
 * mute across several Characters that disagreed about it beforehand.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { Alerts } from './Alerts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  useNotificationPreferences,
  characterEventPrefs,
  isEventEnabledFor,
} from '@/features/notifications/preferences';

vi.mock('@/sync', () => ({
  setSyncedSetting: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));

const KAELEN = 91;
const SERA = 92;

function entry({
  id,
  eventId = 'newMail',
  title = 'New Mail',
  characterId = KAELEN,
  eveType,
  firedAt = Date.now(),
  dismissedAt,
}: {
  id: string;
  eventId?: string;
  title?: string;
  characterId?: number;
  eveType?: string;
  firedAt?: number;
  dismissedAt?: number;
}) {
  return {
    id,
    characterId,
    eventId,
    title,
    body: `${title} — body`,
    firedAt,
    eveType,
    dismissedAt,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Alerts />
    </MemoryRouter>
  );
}

/**
 * Opens the filter controls.
 *
 * `FilterBar` is `collapsible`, so at jsdom's reported width every control but
 * the search box sits behind one funnel trigger — the same as on a phone. A
 * test reaching straight for a chip would be asserting on a layout no reader
 * ever sees.
 */
async function openFilters(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /^filters/i }));
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.notificationFeed.clear();
  await db.characters.bulkPut([
    { characterId: KAELEN, name: 'Kaelen Vor', ownerHash: 'a', addedAt: 1 },
    { characterId: SERA, name: 'Sera Vantis', ownerHash: 'b', addedAt: 2 },
  ]);
  useNotificationPreferences.setState({
    value: DEFAULT_NOTIFICATION_PREFERENCES,
    hydrated: true,
  });
});

describe('Alerts', () => {
  /*
   * The premise. A device back from a week away holds hundreds of fires; a row
   * per fire is not a page anyone can use, and the count is the part that says
   * whether to look.
   */
  it('collapses many fires of one type into a single row carrying the count', async () => {
    await db.notificationFeed.bulkPut([
      ...Array.from({ length: 40 }, (_, i) =>
        entry({ id: `filled-${i}`, eventId: 'marketOrderFilled', title: 'Sell Order Filled' })
      ),
      entry({ id: 'mail-1' }),
    ]);
    renderPage();

    const filled = (await screen.findByText('Sell Order Filled')).closest('li') as HTMLElement;
    // Two rows for forty-one fires — the whole point.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(within(filled).getByText('40')).toBeInTheDocument();
  });

  it('keys EVE notifications on their own type, not on the event they all share', async () => {
    // Every EVE-native notification carries eventId `eveNotification`; grouping
    // on that alone would fold an attack into a corp bill.
    await db.notificationFeed.bulkPut([
      entry({
        id: 'attack',
        eventId: 'eveNotification',
        eveType: 'StructureUnderAttack',
        title: 'Structure Under Attack',
      }),
      entry({
        id: 'bill',
        eventId: 'eveNotification',
        eveType: 'CorpAllBillMsg',
        title: 'Corp bill',
      }),
    ]);
    renderPage();

    expect(await screen.findByText('Structure Under Attack')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('leads with the worst type, whatever order the fires arrived in', async () => {
    await db.notificationFeed.bulkPut([
      entry({ id: 'filled', eventId: 'marketOrderFilled', title: 'Sell Order Filled' }),
      entry({
        id: 'attack',
        eventId: 'eveNotification',
        eveType: 'StructureUnderAttack',
        title: 'Structure Under Attack',
      }),
    ]);
    renderPage();

    await screen.findByText('Structure Under Attack');
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('Structure Under Attack')).toBeInTheDocument();
  });

  it('expands a type to the individual fires, each naming its character', async () => {
    await db.notificationFeed.bulkPut([
      entry({ id: 'a', characterId: KAELEN, firedAt: 2000 }),
      entry({ id: 'b', characterId: SERA, firedAt: 1000 }),
    ]);
    renderPage();

    const row = (await screen.findByText('New Mail')).closest('button') as HTMLElement;
    await userEvent.click(row);
    expect(await screen.findAllByText('Kaelen Vor')).not.toHaveLength(0);
    expect(screen.getAllByText('Sera Vantis')).not.toHaveLength(0);
  });

  it('leaves dismissed fires out entirely', async () => {
    await db.notificationFeed.bulkPut([
      entry({ id: 'live' }),
      entry({ id: 'gone', dismissedAt: Date.now() }),
    ]);
    renderPage();

    await screen.findByText('New Mail');
    expect(within(screen.getAllByRole('listitem')[0]).getByText('1')).toBeInTheDocument();
  });

  /*
   * The reason this page can un-mute at all. `NotificationContextMenu` calls
   * its own mute one-way, because the row it was set from is gone the instant
   * it applies — so before this page existed, Settings was the only way back.
   */
  it('hides a muted type until the chip asks for it', async () => {
    useNotificationPreferences.setState({
      value: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        perCharacter: { [KAELEN]: { newMail: { feed: false, browser: true } } },
      },
      hydrated: true,
    });
    await db.notificationFeed.bulkPut([entry({ id: 'a' })]);
    renderPage();

    await screen.findByRole('heading', { name: 'By type' });
    expect(screen.queryByText('New Mail')).not.toBeInTheDocument();

    await openFilters();
    await userEvent.click(await screen.findByRole('button', { name: /muted types/i }));
    expect(await screen.findByText('New Mail')).toBeInTheDocument();
    expect(screen.getByText('Muted')).toBeInTheDocument();
  });

  /*
   * A type's row spans every Character it fired for, and those Characters can
   * disagree about it — one muted from a context menu months ago, the rest not.
   * Looping a *toggle* over them would flip each independently and land on the
   * inverted mixed state, which is why `setFeedMutedForCharacters` sets.
   */
  it('mutes a type for every character it fired for, from a mixed starting state', async () => {
    useNotificationPreferences.setState({
      value: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        // Already muted on Sera; live on Kaelen. The row reads as live.
        perCharacter: { [SERA]: { newMail: { feed: false, browser: true } } },
      },
      hydrated: true,
    });
    await db.notificationFeed.bulkPut([
      entry({ id: 'a', characterId: KAELEN }),
      entry({ id: 'b', characterId: SERA }),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /stop showing new mail/i }));

    await waitFor(() => {
      const value = useNotificationPreferences.getState().value;
      for (const characterId of [KAELEN, SERA]) {
        expect(
          isEventEnabledFor(characterEventPrefs(value, characterId), 'newMail', 'feed'),
          `character ${characterId}`
        ).toBe(false);
      }
    });
  });

  it('dismisses every fire behind a collapsed row at once', async () => {
    await db.notificationFeed.bulkPut([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /dismiss every new mail/i }));
    await waitFor(async () => {
      const rows = await db.notificationFeed.toArray();
      expect(rows.every((row) => row.dismissedAt !== undefined)).toBe(true);
    });
  });

  it('narrows to one character without counting the others', async () => {
    await db.notificationFeed.bulkPut([
      entry({ id: 'a', characterId: KAELEN }),
      entry({ id: 'b', characterId: SERA }),
    ]);
    renderPage();

    await screen.findByText('New Mail');
    expect(within(screen.getAllByRole('listitem')[0]).getByText('2')).toBeInTheDocument();

    await openFilters();
    await userEvent.click(await screen.findByLabelText('Character'));
    await userEvent.click(await screen.findByRole('option', { name: 'Sera Vantis' }));
    await waitFor(() => {
      expect(within(screen.getAllByRole('listitem')[0]).getByText('1')).toBeInTheDocument();
    });
  });

  it('searches what an alert actually said, not only its type name', async () => {
    await db.notificationFeed.put({
      id: 'fuel',
      characterId: KAELEN,
      eventId: 'eveNotification',
      eveType: 'StructureFuelAlert',
      title: 'Structure fuel low',
      body: 'Raitaru · Ahbazon III has 12 hours of fuel',
      firedAt: Date.now(),
    });
    await db.notificationFeed.put(entry({ id: 'mail' }));
    renderPage();

    await screen.findByText('New Mail');
    await userEvent.type(screen.getByLabelText('Search alerts'), 'ahbazon');

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
    expect(screen.getByText('Structure Low on Fuel')).toBeInTheDocument();
  });

  it('says so when the feed channel is switched off, rather than looking broken', async () => {
    useNotificationPreferences.setState({
      value: { ...DEFAULT_NOTIFICATION_PREFERENCES, feedEnabled: false },
      hydrated: true,
    });
    await db.notificationFeed.put(entry({ id: 'a' }));
    renderPage();

    expect(await screen.findByText(/switched off in Settings/i)).toBeInTheDocument();
    // The rows are still listed: they happened, and they are still dismissible.
    // Awaited, because the banner renders off preferences while the rows come
    // from a Dexie live query that lands a tick later.
    expect(await screen.findByText('New Mail')).toBeInTheDocument();
  });

  it('offers an empty state rather than a bare panel', async () => {
    renderPage();
    expect(await screen.findByText('No alerts yet')).toBeInTheDocument();
  });
  describe('header controls', () => {
    it('names both header actions, which carry no visible text', async () => {
      await db.notificationFeed.put(entry({ id: 'a' }));
      renderPage();

      // Icon-only controls fail by announcing "button"/"link" and nothing
      // else; the tooltip and the accessible name are the same string here.
      expect(await screen.findByRole('button', { name: 'Dismiss all' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Notification settings' })).toHaveAttribute(
        'href',
        '/settings#notifications'
      );
    });

    it('still dismisses every live alert from the icon', async () => {
      await db.notificationFeed.put(entry({ id: 'a' }));
      await db.notificationFeed.put(entry({ id: 'b', eventId: 'skillComplete', title: 'Skill' }));
      renderPage();

      await userEvent.click(await screen.findByRole('button', { name: 'Dismiss all' }));

      await waitFor(async () => {
        const stored = await db.notificationFeed.toArray();
        expect(stored.every((row) => row.dismissedAt !== undefined)).toBe(true);
      });
    });

    it('hides the dismiss control when there is nothing live to dismiss', async () => {
      renderPage();

      await screen.findByRole('link', { name: 'Notification settings' });
      expect(screen.queryByRole('button', { name: 'Dismiss all' })).not.toBeInTheDocument();
    });

    it('does not restate the counts beside the title', async () => {
      await db.notificationFeed.put(entry({ id: 'a' }));
      renderPage();

      // The list below already says all of this, per type and per character.
      await screen.findByText('New Mail');
      expect(screen.queryByText(/alerts? .* types .* characters/)).not.toBeInTheDocument();
    });
  });
});
