import { describe, it, expect, beforeEach } from 'vitest';
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

    const row = screen.getByRole('button', { name: 'Skill Level Complete' });
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

    await user.click(screen.getByRole('button', { name: 'Skill Level Complete' }));
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Skill Level Complete, Beta Pilot, device notifications',
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
    expect(screen.getByRole('button', { name: 'Skill Level Complete' })).toHaveAttribute(
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
    // Only two can use it, so only two are counted.
    expect(screen.getByText('All 2 alike')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skill Level Complete' }));
    expect(
      screen.getByRole('checkbox', {
        name: 'Skill Level Complete, Gamma Pilot, device notifications',
      })
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Skill Level Complete for every character, device notifications',
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
        name: 'Skill Level Complete for every character, device notifications',
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

    await user.click(screen.getByRole('button', { name: 'EVE Notifications' }));
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
});
