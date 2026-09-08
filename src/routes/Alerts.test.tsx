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

  /*
   * Expanding a type is where the body copy lives, and on a phone that copy
   * was fighting a portrait, a nine-character indent and a fixed-width clock
   * for a 390px line. The portrait went first: it identified nothing the name
   * beside it did not already say.
   */
  describe('an expanded type', () => {
    /*
     * Anchored on `expanded`, not on the name alone: "Stop showing New Mail"
     * and "Dismiss every New Mail" sit in the same row and match the same
     * words. The disclosure is the only one of the three that is a disclosure.
     */
    async function expandNewMail() {
      await userEvent.click(
        await screen.findByRole('button', { name: /new mail/i, expanded: false })
      );
    }

    it('carries no character portrait', async () => {
      await db.notificationFeed.bulkPut([
        entry({ id: 'a', characterId: KAELEN }),
        entry({ id: 'b', characterId: SERA }),
      ]);
      renderPage();
      await expandNewMail();

      // Both fires, so the assertion below is about an expanded list rather
      // than an empty one that trivially has no portraits in it.
      expect(await screen.findAllByText(/New Mail — body/)).toHaveLength(2);
      expect(screen.queryAllByRole('img')).toHaveLength(0);
    });

    /*
     * And so the name has to carry the identification on its own, at every
     * width. It used to be hidden below `sm` with the portrait standing in for
     * it — which is exactly the width where whose-alert-is-this matters most,
     * this page existing because an alt's alerts were invisible until you
     * switched to it.
     */
    /*
     * The other half of the same rule: with one Character on the device every
     * row would say the same name, and that name is width the body copy could
     * have had. The seeded device has two, so this test removes one.
     */
    it('drops the name entirely when the device has only one character', async () => {
      await db.characters.where('characterId').equals(SERA).delete();
      await db.notificationFeed.bulkPut([entry({ id: 'a', characterId: KAELEN })]);
      renderPage();
      await expandNewMail();

      expect(await screen.findAllByText(/New Mail — body/)).toHaveLength(1);
      expect(screen.queryByText('Kaelen Vor')).not.toBeInTheDocument();
    });

    it('names the character once, visibly, rather than only to a screen reader', async () => {
      await db.notificationFeed.bulkPut([
        entry({ id: 'a', characterId: KAELEN }),
        entry({ id: 'b', characterId: SERA }),
      ]);
      renderPage();
      await expandNewMail();

      for (const who of ['Kaelen Vor', 'Sera Vantis']) {
        const named = await screen.findAllByText(who);
        // Once, not twice: the old pair was a visible span plus an `sr-only`
        // one, and dropping either half of that pair without the other is how
        // this ends up announced twice or not at all.
        expect(named, who).toHaveLength(1);
        expect(named[0].className).not.toMatch(/sr-only/);
      }
    });
  });

  it('offers an empty state rather than a bare panel', async () => {
    renderPage();
    expect(await screen.findByText('No alerts yet')).toBeInTheDocument();
  });
});
