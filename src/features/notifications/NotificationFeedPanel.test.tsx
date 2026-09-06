import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { NotificationFeedPanel } from './NotificationFeedPanel';
import {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFS_SETTING_KEY,
} from './preferences';
import { recordFeedEntry } from './feed';

const ACTIVE = 1;
const ALT = 2;

beforeEach(async () => {
  await db.notificationFeed.clear();
  await db.settings.clear();
  await db.characters.clear();
  await db.characters.bulkPut([
    { characterId: ACTIVE, name: 'Active Pilot', ownerHash: 'h1', addedAt: 0 },
    { characterId: ALT, name: 'Alt One', ownerHash: 'h2', addedAt: 0 },
  ]);
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: ACTIVE, hydrated: true });
});

async function seed(title: string, body: string, firedAt: number, characterId = ACTIVE) {
  await recordFeedEntry({
    id: crypto.randomUUID(),
    characterId,
    eventId: 'newMail',
    title,
    body,
    firedAt,
  });
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <NotificationFeedPanel />
    </MemoryRouter>
  );
}

describe('NotificationFeedPanel', () => {
  it('lists fired notifications newest first', async () => {
    await seed('Older', 'first body', 1000);
    await seed('Newer', 'second body', 2000);

    renderPanel();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Newer');
    expect(items[1]).toHaveTextContent('Older');
  });

  it('shows an empty state with nothing fired', async () => {
    renderPanel();
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss all' })).not.toBeInTheDocument();
  });

  it('dismisses one notification at a time, leaving the rest', async () => {
    await seed('Keep me', 'a', 1000);
    await seed('Dismiss me', 'b', 2000);
    renderPanel();
    await screen.findByText('Dismiss me');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Dismiss me' }));

    await waitFor(() => expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument());
    expect(screen.getByText('Keep me')).toBeInTheDocument();
    const rows = await db.notificationFeed.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((e) => e.title === 'Dismiss me')?.dismissedAt).toBeTypeOf('number');
    expect(rows.find((e) => e.title === 'Keep me')?.dismissedAt).toBeUndefined();
  });

  it('dismisses every notification in bulk', async () => {
    await seed('One', 'a', 1000);
    await seed('Two', 'b', 2000);
    renderPanel();
    await screen.findByText('Two');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));

    await waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument());
    const rows = await db.notificationFeed.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.every((e) => typeof e.dismissedAt === 'number')).toBe(true);
  });

  it('renders nothing when the feed channel is switched off', async () => {
    await db.settings.put({
      key: NOTIFICATION_PREFS_SETTING_KEY,
      value: { masterEnabled: true, feedEnabled: false, perCharacter: {} },
    });
    await seed('Hidden', 'a', 1000);

    const { container } = renderPanel();

    await waitFor(() => expect(useNotificationPreferences.getState().hydrated).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the active character, counting the others separately', async () => {
    await seed('Mine', 'a', 2000, ACTIVE);
    await seed('Alt alert', 'b', 1000, ALT);
    await seed('Alt alert two', 'c', 900, ALT);

    renderPanel();

    expect(await screen.findByText('Mine')).toBeInTheDocument();
    expect(screen.queryByText('Alt alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alt One/ })).toHaveTextContent('2');
  });

  it('switches the active character when an other-character count is tapped', async () => {
    await seed('Alt alert', 'b', 1000, ALT);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /Alt One/ }));

    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(ALT));
  });

  it('dismisses all for the active character without touching another character', async () => {
    await seed('Mine', 'a', 2000, ACTIVE);
    await seed('Alt alert', 'b', 1000, ALT);
    renderPanel();
    await screen.findByText('Mine');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));

    await waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument());
    const left = await db.notificationFeed.toArray();
    expect(left).toHaveLength(2);
    expect(left.find((e) => e.characterId === ACTIVE)?.dismissedAt).toBeTypeOf('number');
    expect(left.find((e) => e.characterId === ALT)?.dismissedAt).toBeUndefined();
  });

  it('hides an entry as soon as its event type is switched off', async () => {
    await seed('Mail alert', 'a', 1000, ACTIVE);
    renderPanel();
    await screen.findByText('Mail alert');

    await useNotificationPreferences.getState().setValue({
      masterEnabled: true,
      perCharacter: { [ACTIVE]: { newMail: false } },
    });

    await waitFor(() => expect(screen.queryByText('Mail alert')).not.toBeInTheDocument());
  });

  it('links to the notification settings section', async () => {
    renderPanel();
    const link = await screen.findByRole('link', { name: 'Settings' });
    expect(link).toHaveAttribute('href', '/settings#notifications');
  });

  it('links each entry to the page its event belongs on', async () => {
    await recordFeedEntry({
      id: crypto.randomUUID(),
      characterId: ACTIVE,
      eventId: 'walletBalanceChanged',
      title: 'Wallet changed',
      body: 'ISK moved',
      firedAt: 1000,
    });
    renderPanel();

    const link = await screen.findByRole('link', { name: /Wallet changed/ });
    expect(link).toHaveAttribute('href', '/wallet?tab=journal');
  });

  it('collapses rows that read identically into one carrying the count', async () => {
    for (let i = 0; i < 6; i++)
      await seed('Market order filled', 'Your order was filled.', 1000 + i);

    renderPanel();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Market order filled x6');
  });

  it('says how far back a collapsed row reaches, so a catch-up pile cannot read as one recent burst', async () => {
    const now = Date.now();
    await seed('Market order filled', 'Your order was filled.', now - 3 * 86_400_000);
    await seed('Market order filled', 'Your order was filled.', now - 30_000);

    renderPanel();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('from 3d ago to just now');
  });

  it('leaves the span off a collapsed row whose rows all read the same age', async () => {
    const now = Date.now();
    await seed('Market order filled', 'Your order was filled.', now - 30_000);
    await seed('Market order filled', 'Your order was filled.', now - 29_000);

    renderPanel();

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).not.toHaveTextContent('from');
  });

  it('leaves a lone notification’s title alone — no "x1"', async () => {
    await seed('Market order filled', 'Your order was filled.', 1000);

    renderPanel();

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Market order filled');
    expect(items[0]).not.toHaveTextContent('x1');
  });

  it('collapses across an unrelated notification sitting between the duplicates', async () => {
    await seed('Market order filled', 'Your order was filled.', 3000);
    await seed('Wallet balance changed', 'Balance changed.', 2000);
    await seed('Market order filled', 'Your order was filled.', 1000);

    renderPanel();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    // The group keeps the place of its newest member, so the list stays
    // newest-first rather than the pair sinking to the older one's slot.
    expect(items[0]).toHaveTextContent('Market order filled x2');
    expect(items[1]).toHaveTextContent('Wallet balance changed');
  });

  it('keeps notifications with different bodies apart, however alike their titles', async () => {
    await seed('Skill training complete', 'Finished Gunnery V.', 2000);
    await seed('Skill training complete', 'Finished Missiles IV.', 1000);

    renderPanel();

    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });

  it('dismisses every notification behind a collapsed row, not just the one on screen', async () => {
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++)
      await seed('Market order filled', 'Your order was filled.', 1000 + i);
    await seed('Keep me', 'different body', 500);

    renderPanel();
    await screen.findByText('Market order filled x3');

    await user.click(screen.getByRole('button', { name: 'Dismiss Market order filled x3' }));

    await waitFor(async () => {
      const rows = await db.notificationFeed.toArray();
      expect(rows.filter((r) => r.dismissedAt === undefined)).toHaveLength(1);
    });
    // Asserted against the list, not the document: the dismiss button's own
    // tooltip still holds its label ("Dismiss Market order filled x3") while
    // it fades, and a document-wide text query would match that too.
    //
    // Inside `waitFor` rather than a bare `findAllByRole`, which resolves on
    // the first non-empty match and so would read the list mid-update, before
    // the dismissed group has left it.
    await waitFor(() => {
      const remaining = screen.getAllByRole('listitem');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toHaveTextContent('Keep me');
    });
  });

  it('renders nothing when the master switch is off', async () => {
    await db.settings.put({
      key: NOTIFICATION_PREFS_SETTING_KEY,
      value: { masterEnabled: false, perCharacter: {} },
    });
    await seed('Hidden', 'a', 1000);

    const { container } = renderPanel();

    await waitFor(() => expect(useNotificationPreferences.getState().hydrated).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});
