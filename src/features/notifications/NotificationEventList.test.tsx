import { NO_CHANNEL_OFF } from './channelOff';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { NotificationEventList } from './NotificationEventList';
import type { EventRowContext } from './eventRowSupport';
import { NOTIFICATION_EVENT_IDS, NOTIFICATION_EVENTS } from './events';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  useNotificationPreferences,
  type NotificationPreferencesValue,
} from './preferences';

// Preference writes schedule a sync, which lazy-loads Firebase; that import can
// land after the test environment is torn down and fail the whole shard.
vi.mock('@/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sync')>()),
  setSyncedSetting: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));

const ALL_SCOPES = new Set(
  NOTIFICATION_EVENTS.map((event) => event.scope).filter((scope) => scope !== undefined)
);
const NO_SCOPES = new Set<string>();
const CHARACTERS = [
  { characterId: 1, name: 'Alpha Pilot' },
  { characterId: 2, name: 'Beta Pilot' },
  { characterId: 3, name: 'Gamma Pilot' },
];

function context(over: Partial<EventRowContext> = {}): EventRowContext {
  return {
    characters: CHARACTERS,
    scopesByCharacterId: new Map([
      [1, ALL_SCOPES],
      [2, ALL_SCOPES],
      [3, ALL_SCOPES],
    ]),
    capabilitiesByCharacterId: new Map(),
    prefsValue: useNotificationPreferences.getState().value,
    channelOff: NO_CHANNEL_OFF,
    visibleCharacterIds: null,
    forceExpanded: false,
    isDesktop: true,
    ...over,
  };
}

function Harness(props: {
  over?: Partial<EventRowContext>;
  ids?: typeof NOTIFICATION_EVENT_IDS;
  searching?: boolean;
  path?: string;
}) {
  // Re-read the store each render so a click's write is visible, like the panel does.
  const value = useNotificationPreferences((state) => state.value);
  return (
    <MemoryRouter initialEntries={[props.path ?? '/settings/notifications']}>
      <NotificationEventList
        searching={props.searching}
        eventIds={props.ids ?? NOTIFICATION_EVENT_IDS}
        context={context({ prefsValue: value, ...props.over })}
        extraTypesByCharacter={new Map()}
      />
    </MemoryRouter>
  );
}

function setPrefs(value: NotificationPreferencesValue) {
  act(() => useNotificationPreferences.setState({ value, hydrated: true }));
}

beforeEach(async () => {
  await db.settings.clear();
  setPrefs(DEFAULT_NOTIFICATION_PREFERENCES);
});

describe('NotificationEventList on desktop', () => {
  it('opens a row inline, with no dialog, and lists every character as a chip', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const row = screen.getByRole('button', { name: 'Skill level complete' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Alpha Pilot')).not.toBeInTheDocument();

    await user.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    for (const { name } of CHARACTERS) expect(screen.getByText(name)).toBeInTheDocument();
  });

  it('says "All 3 alike" until a character differs, then "1 differs" and highlights that chip', async () => {
    const user = userEvent.setup();
    render(<Harness ids={['skillLevelComplete']} />);
    expect(screen.getByText('All 3 alike')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skill level complete' }));
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Skill level complete, Beta Pilot, device notifications',
      })
    );

    await waitFor(() => expect(screen.getByText('1 differs')).toBeInTheDocument());
    const chip = screen.getByText('Beta Pilot').closest('li')!;
    expect(chip.className).toMatch(/border-warning/);
    // The odd one is named by words and position too, not by colour alone.
    expect(within(chip).getByText('D')).toBeInTheDocument();
  });

  it('opens by itself, narrowed to the searched characters, when a search asks for it', () => {
    render(
      <Harness
        ids={['skillLevelComplete']}
        over={{ forceExpanded: true, visibleCharacterIds: new Set([2]) }}
      />
    );
    expect(screen.getByRole('button', { name: 'Skill level complete' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('Beta Pilot')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Pilot')).not.toBeInTheDocument();
  });

  it('leaves out characters that lack the scope from the broadcast, but keeps them listed and dimmed', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        ids={['skillLevelComplete']}
        over={{
          scopesByCharacterId: new Map([
            [1, ALL_SCOPES],
            [2, ALL_SCOPES],
            [3, NO_SCOPES],
          ]),
        }}
      />
    );
    // Only two can use it: the chip says so rather than claiming all three.
    expect(screen.getByText('2 of 3 can use this')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skill level complete' }));
    expect(
      screen.getByRole('checkbox', {
        name: 'Skill level complete, Gamma Pilot, device notifications',
      })
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Skill level complete for every character, device notifications',
      })
    );
    await waitFor(() => {
      const perCharacter = useNotificationPreferences.getState().value.perCharacter;
      expect(perCharacter[1]?.skillLevelComplete).toMatchObject({ browser: false });
      expect(perCharacter[3]).toBeUndefined();
    });
  });

  it('disables a row whose event no character can use', () => {
    render(
      <Harness
        ids={['skillLevelComplete']}
        over={{
          scopesByCharacterId: new Map([
            [1, NO_SCOPES],
            [2, NO_SCOPES],
            [3, NO_SCOPES],
          ]),
        }}
      />
    );
    expect(screen.getByText('None can use this')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'Skill level complete for every character, device notifications',
      })
    ).toBeDisabled();
  });

  it('shows no summary chip for a single character', () => {
    render(<Harness ids={['skillLevelComplete']} over={{ characters: [CHARACTERS[0]] }} />);
    expect(screen.queryByText(/alike/)).not.toBeInTheDocument();
  });

  it('lists the EVE type rows under the EVE row without opening it, each openable to its characters', async () => {
    const user = userEvent.setup();
    render(<Harness ids={['eveNotification']} />);

    expect(screen.getByRole('button', { name: 'EVE notifications' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await user.click(screen.getByRole('button', { name: 'Structure Under Attack' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Structure Under Attack, Alpha Pilot, device notifications',
      })
    );
    await waitFor(() => {
      const byType = useNotificationPreferences.getState().value.eveNotificationTypesByCharacter;
      expect(byType?.[1]).toBeDefined();
      expect(byType?.[2]).toBeUndefined();
    });
  });

  it('shows the EVE type rows on the phone page too, with no sheet to open first', () => {
    render(
      <Harness
        ids={['eveNotification']}
        over={{ isDesktop: false }}
        path="/settings/notifications?topic=eve"
      />
    );
    expect(screen.getByRole('button', { name: 'Structure Under Attack' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the EVE type rows out of a search stack, which would bury every other match', () => {
    render(<Harness ids={['eveNotification']} searching />);
    expect(screen.getByRole('button', { name: 'EVE notifications' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Structure Under Attack' })
    ).not.toBeInTheDocument();
  });

  it('lets the user close a row a search opened', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        ids={['skillLevelComplete']}
        over={{ forceExpanded: true, visibleCharacterIds: new Set([2]) }}
      />
    );
    const row = screen.getByRole('button', { name: 'Skill level complete' });
    expect(row).toHaveAttribute('aria-expanded', 'true');

    await user.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Beta Pilot')).not.toBeInTheDocument();
  });

  it('never opens the EVE notifications row by itself, even when a search asks for rows to open', () => {
    render(<Harness ids={['eveNotification']} over={{ forceExpanded: true }} />);
    expect(screen.getByRole('button', { name: 'EVE notifications' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('says a lone character cannot use an event on the closed row, instead of just disabling it', () => {
    render(
      <Harness
        ids={['skillLevelComplete']}
        over={{
          characters: [CHARACTERS[0]],
          scopesByCharacterId: new Map([[1, NO_SCOPES]]),
        }}
      />
    );
    expect(screen.getByText('None can use this')).toBeInTheDocument();
  });

  it('shows who has not granted a Permission, and the delivery hint, on the closed row', () => {
    render(
      <Harness
        ids={['planetaryExtractorExpiring']}
        over={{
          scopesByCharacterId: new Map([
            [1, ALL_SCOPES],
            [2, ALL_SCOPES],
            [3, NO_SCOPES],
          ]),
        }}
      />
    );
    expect(screen.getByText(/1 character hasn't granted/)).toBeInTheDocument();
    expect(screen.getByText(/delivered up to 72 hours ahead/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planetary extractor expiring' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('says the Corporation permission once on the corp group, not on every corp row', () => {
    render(
      <Harness
        ids={NOTIFICATION_EVENT_IDS.filter(
          (id) => id.startsWith('corp') || id === 'structureFuelLow'
        )}
        over={{
          scopesByCharacterId: new Map([
            [1, ALL_SCOPES],
            [2, ALL_SCOPES],
            [3, NO_SCOPES],
          ]),
        }}
      />
    );
    expect(screen.getAllByText(/hasn't granted/)).toHaveLength(1);
  });

  it('marks a differing character with words for a screen reader, not only a colour', async () => {
    const user = userEvent.setup();
    render(<Harness ids={['skillLevelComplete']} />);
    await user.click(screen.getByRole('button', { name: 'Skill level complete' }));
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Skill level complete, Beta Pilot, device notifications',
      })
    );

    await waitFor(() =>
      expect(
        within(screen.getByText('Beta Pilot').closest('li')!).getByText('Differs from the rest')
      ).toBeInTheDocument()
    );
    expect(
      within(screen.getByText('Alpha Pilot').closest('li')!).queryByText('Differs from the rest')
    ).not.toBeInTheDocument();
  });

  it('lists warn-ahead times only for the searched characters when a search narrows the row', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        ids={['skillQueueEnding']}
        over={{ forceExpanded: true, visibleCharacterIds: new Set([2]) }}
      />
    );
    // One character matches, so the disclosure counts one, not three.
    await user.click(
      await screen.findByRole('button', { name: /Warn-ahead time \(1 character\)/ })
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('toggles when the D or A beside a checkbox is clicked, not only the 16px box', async () => {
    // The letters look like the box's label; a click on one that did nothing read as a click that did not register.
    const user = userEvent.setup();
    render(<Harness ids={['skillLevelComplete']} />);
    await user.click(screen.getByRole('button', { name: 'Skill level complete' }));
    const chip = screen.getByText('Beta Pilot').closest('li')!;
    const alerts = within(chip).getByRole('checkbox', {
      name: 'Skill level complete, Beta Pilot, Alerts list',
    });
    const device = within(chip).getByRole('checkbox', {
      name: 'Skill level complete, Beta Pilot, device notifications',
    });
    expect(alerts).toBeChecked();
    expect(device).toBeChecked();

    await user.click(within(chip).getByText('A'));
    await waitFor(() => expect(alerts).not.toBeChecked());
    expect(device).toBeChecked();

    await user.click(within(chip).getByText('D'));
    await waitFor(() => expect(device).not.toBeChecked());
  });
});

describe('NotificationEventList Topics', () => {
  it("shows one topic at a time on desktop, tabs carrying each topic's event count", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('tab', { name: /^Skills\s*5$/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Skill level complete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New mail' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Mail and calendar/ }));
    expect(screen.getByRole('button', { name: 'New mail' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skill level complete' })).not.toBeInTheDocument();
  });

  it('puts the column captions, warn-ahead and characters notes on the desktop table', () => {
    render(<Harness ids={['skillQueueEnding']} />);
    expect(screen.getByText('Warn ahead')).toBeInTheDocument();
    expect(screen.getByText('Characters')).toBeInTheDocument();
    // Warn-ahead sits on the event's own row, not in a separate list.
    expect(screen.getByRole('button', { name: /Warn-ahead times \(3 characters\)/ })).toBeVisible();
  });

  it('lists every matching topic in one stack while searching', () => {
    render(<Harness ids={['newMail', 'skillLevelComplete']} searching />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mail and calendar' })).toBeInTheDocument();
  });

  it('on a phone lists topics with a one-line state, and drills into one', async () => {
    const user = userEvent.setup();
    render(<Harness over={{ isDesktop: false }} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const topic = screen.getByRole('button', { name: /Mail and calendar/ });
    expect(topic).toHaveTextContent('Device 3 · Alerts 3 of 3');

    await user.click(topic);
    expect(screen.getByRole('button', { name: 'New mail' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All topics' }));
    expect(screen.getByRole('button', { name: /Mail and calendar/ })).toBeInTheDocument();
  });

  it('on a phone says Corp needs the Corporation permission when no character can use it', () => {
    render(
      <Harness
        over={{
          isDesktop: false,
          scopesByCharacterId: new Map([
            [1, NO_SCOPES],
            [2, NO_SCOPES],
            [3, NO_SCOPES],
          ]),
        }}
      />
    );
    expect(screen.getByRole('button', { name: /^Corp/ })).toHaveTextContent(
      'Needs Corporation permission'
    );
  });

  it('never prints a truncating class on an event name', () => {
    render(
      <Harness ids={['skillQueueEnding']} over={{ isDesktop: false }} path="/?topic=skills" />
    );
    const name = screen.getByText('Skill queue ending');
    expect(name.className).not.toMatch(/truncate/);
  });
});

describe('NotificationEventList Apply to all', () => {
  it('fixes the one character that differs, leaving the rest alone, then reads all alike', async () => {
    const user = userEvent.setup();
    render(<Harness ids={['skillLevelComplete']} />);
    await user.click(screen.getByRole('button', { name: 'Skill level complete' }));
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Skill level complete, Beta Pilot, device notifications',
      })
    );
    await waitFor(() => expect(screen.getByText('1 differs')).toBeInTheDocument());
    expect(
      within(screen.getByText('Beta Pilot').closest('li')!).getByRole('checkbox', {
        name: 'Skill level complete, Beta Pilot, device notifications',
      })
    ).not.toBeChecked();

    await user.click(
      screen.getByRole('button', { name: 'Apply to all characters: Skill level complete' })
    );

    await waitFor(() => expect(screen.getByText('All 3 alike')).toBeInTheDocument());
    for (const { name } of CHARACTERS) {
      expect(
        within(screen.getByText(name).closest('li')!).getByRole('checkbox', {
          name: `Skill level complete, ${name}, device notifications`,
        })
      ).toBeChecked();
    }
    expect(
      screen.queryByRole('button', { name: 'Apply to all characters: Skill level complete' })
    ).not.toBeInTheDocument();
  });

  it('offers no Apply to all while every character is alike', async () => {
    const user = userEvent.setup();
    render(<Harness ids={['skillLevelComplete']} />);
    await user.click(screen.getByRole('button', { name: 'Skill level complete' }));
    expect(screen.queryByRole('button', { name: /Apply to all/ })).not.toBeInTheDocument();
  });
});

describe('NotificationEventList with a channel off', () => {
  const deviceOff = { browser: 'deviceToggleOff', feed: null } as const;
  const alertsOff = { browser: null, feed: 'alertsToggleOff' } as const;

  it('greys the Device column but keeps its ticks, and leaves Alerts live', () => {
    render(<Harness ids={['skillLevelComplete']} over={{ channelOff: deviceOff }} />);
    const device = screen.getByRole('checkbox', {
      name: 'Skill level complete for every character, device notifications',
    });
    expect(device).toBeDisabled();
    expect(device).toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'Skill level complete for every character, Alerts list',
      })
    ).toBeEnabled();
  });

  it('greys the Alerts column but keeps its ticks', () => {
    render(<Harness ids={['skillLevelComplete']} over={{ channelOff: alertsOff }} />);
    const alerts = screen.getByRole('checkbox', {
      name: 'Skill level complete for every character, Alerts list',
    });
    expect(alerts).toBeDisabled();
    expect(alerts).toBeChecked();
  });

  it('greys D in an opened event, keeps the tick and does not toggle it', async () => {
    const user = userEvent.setup();
    render(<Harness ids={['skillLevelComplete']} over={{ channelOff: deviceOff }} />);
    await user.click(screen.getByRole('button', { name: 'Skill level complete' }));
    const chip = screen.getByRole('checkbox', {
      name: 'Skill level complete, Beta Pilot, device notifications',
    });
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    expect(chip).toBeChecked();
    await user.click(chip);
    expect(chip).toBeChecked();
  });
});
