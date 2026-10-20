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
    browserBlocked: false,
    visibleCharacterIds: null,
    forceExpanded: false,
    isDesktop: true,
    ...over,
  };
}

function Harness(props: { over?: Partial<EventRowContext>; ids?: typeof NOTIFICATION_EVENT_IDS }) {
  // Re-read the store each render so a click's write is visible, like the panel does.
  const value = useNotificationPreferences((state) => state.value);
  return (
    <MemoryRouter>
      <NotificationEventList
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

  it('keeps the EVE type rows inline under the EVE row, each openable to its characters', async () => {
    const user = userEvent.setup();
    render(<Harness ids={['eveNotification']} />);

    await user.click(screen.getByRole('button', { name: 'EVE notifications' }));
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
