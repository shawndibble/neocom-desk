import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/db';
import '@/i18n';

const login = vi.hoisted(() => ({ begin: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginAlertsLogin: login.begin }));
const remote = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock('@/sync/alertsGrantApi', () => ({
  saveAlertGrantRemote: vi.fn(),
  deleteAlertGrantRemote: remote.del,
}));

import { AlertsWhenClosedSection } from './AlertsWhenClosedSection';
import { DEFAULT_NOTIFICATION_PREFERENCES, useNotificationPreferences } from './preferences';
import { markAlertsNeedReauth, readAlertsGrants } from './alertsGrant';
import { queueAlertsWalk } from './alertsGrant';

const characters = [
  { characterId: 1, name: 'Alpha' },
  { characterId: 2, name: 'Beta' },
];

/** The grant screen starts closed (a dialog off Delivery's summary); most tests need the rows, so they open it. */
async function renderSection(state?: unknown, { open = true } = {}) {
  const result = render(
    <MemoryRouter initialEntries={[{ pathname: '/settings/notifications', state }]}>
      <AlertsWhenClosedSection characters={characters} />
    </MemoryRouter>
  );
  if (open) {
    await userEvent.click(await screen.findByRole('button', { name: /Alerts when closed/ }));
  }
  return result;
}

/** Device sign-ins holding the mail and location scopes, so those events count as ticked-and-usable. */
async function seedTokens(...ids: number[]) {
  for (const characterId of ids) {
    await db.tokens.put({
      characterId,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 600_000,
      scopes: ['esi-mail.read_mail.v1', 'esi-location.read_location.v1'],
    } as never);
  }
}

async function takes(extra: 'alertsNearby' | 'alertsMail', characterIds: number[] = []) {
  await db.settings.put({ key: extra, value: { supported: true, characterIds } });
}

async function turnOn(characterId: number) {
  await db.settings.put({
    key: 'alertsGrants',
    value: { [characterId]: { status: 'active', enabledAt: 1 } },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES });
  await db.settings.clear();
  login.begin.mockResolvedValue(undefined);
  remote.del.mockResolvedValue(undefined);
});

describe('AlertsWhenClosedSection', () => {
  it('starts closed with a one-line summary and no rows', async () => {
    await renderSection(undefined, { open: false });
    expect(await screen.findByText('0 of 2 characters')).toBeInTheDocument();
    expect(screen.queryByTestId('alerts-state-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alerts when closed/ })).toHaveAttribute(
      'aria-haspopup',
      'dialog'
    );
  });

  it('opens the grant screen from the summary and closes it again', async () => {
    await renderSection(undefined, { open: false });
    await userEvent.click(await screen.findByRole('button', { name: /Alerts when closed/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Alerts when closed' });
    expect(within(dialog).getByTestId('alerts-state-1')).toHaveTextContent('Off');
    await userEvent.click(within(dialog).getAllByRole('button', { name: /close/i })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens by itself on arrival from EVE, so the outcome is not lost behind a closed screen', async () => {
    await renderSection(
      { alertsGrant: { status: 'on', characterId: 1, name: 'Alpha' } },
      { open: false }
    );
    expect(await screen.findByRole('dialog', { name: 'Alerts when closed' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Alerts when closed is on for Alpha'
    );
  });

  it('closed, it counts the Characters that are on and the ones needing a sign-in', async () => {
    await db.settings.put({
      key: 'alertsGrants',
      value: {
        1: { status: 'active', enabledAt: 1 },
        2: { status: 'needs-reauth', enabledAt: 1 },
      },
    });
    await renderSection(undefined, { open: false });
    expect(await screen.findByText(/1 of 2 characters/)).toBeInTheDocument();
    expect(screen.getByText(/1 needs a login/)).toBeInTheDocument();
  });

  it('says what every Character is missing, in one place', async () => {
    await takes('alertsNearby');
    await takes('alertsMail');
    await seedTokens(1, 2);
    await renderSection();
    expect(
      await screen.findByText(
        '2 Characters need a login for: EVE notifications, nearby alerts, and new mail.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in 2 characters…' })).toBeInTheDocument();
  });

  it('nothing is requested from the list: Log in… only opens the permission screen', async () => {
    await renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Log Beta in to EVE for alerts when closed' })
    );
    expect(login.begin).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Nothing is requested until you press Continue/)
    ).toBeInTheDocument();
  });

  it('the permission screen lists notifications, and Continue signs in only that Character', async () => {
    await renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Log Beta in to EVE for alerts when closed' })
    );
    expect(screen.getByText('EVE notifications')).toBeInTheDocument();
    expect(screen.queryByText(/Mail headers/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue to EVE' }));
    expect(login.begin).toHaveBeenCalledTimes(1);
    expect(login.begin).toHaveBeenCalledWith(2, { nearby: false, mail: false });
  });

  it('shows mail and location plainly, with a way to leave each out', async () => {
    await takes('alertsNearby');
    await takes('alertsMail');
    await seedTokens(1, 2);
    await renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Log in 2 characters…' }));
    expect(screen.getByText(/never the message/)).toBeInTheDocument();
    expect(screen.getByText(/Needed for: Incursion nearby/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Mail headers/ }));
    expect(
      screen.getByText(/Left out: new mail only alerts while the app is open/)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue to EVE' }));
    expect(login.begin).toHaveBeenCalledWith(1, { nearby: true, mail: false });
  });

  it('one sign-in per Character, each with its own union, one at a time', async () => {
    await takes('alertsNearby');
    await takes('alertsMail');
    await seedTokens(1, 2);
    useNotificationPreferences.setState({
      value: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        perCharacter: { 2: { newMail: { browser: false } } },
      },
    });
    await renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Log in 2 characters…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue to EVE' }));
    expect(login.begin).toHaveBeenCalledTimes(1);
    expect(login.begin).toHaveBeenCalledWith(1, { nearby: true, mail: true });
    // The next step waits for the return from EVE and is already decided.
    expect(JSON.parse(sessionStorage.getItem('neocom.alerts.queue')!).remaining).toEqual([
      { characterId: 2, nearby: true, mail: false },
    ]);
  });

  it('skips a Character that already holds all it needs, and shows it as On', async () => {
    await turnOn(1);
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('alerts-state-1')).toHaveTextContent(/^On$/));
    expect(
      screen.queryByRole('button', { name: 'Log Alpha in to EVE for alerts when closed' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Log in \d+ characters/ })).toBeNull();
  });

  it('a Character with nothing ticked for Device is not asked at all', async () => {
    useNotificationPreferences.setState({
      value: { ...DEFAULT_NOTIFICATION_PREFERENCES, browserEnabled: false },
    });
    await renderSection();
    expect(
      await screen.findByText(/Every Character has what its ticked Device alerts need/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log in/ })).toBeNull();
  });

  it('renders On with Turn off, and Turn off deletes the grant', async () => {
    await turnOn(1);
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On'));
    await userEvent.click(
      screen.getByRole('button', { name: /Turn off alerts when closed for Alpha/ })
    );
    await waitFor(() => expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('Off'));
    expect(remote.del).toHaveBeenCalledWith(1);
    expect(await readAlertsGrants()).toEqual({});
  });

  it('keeps On and says so when the delete fails', async () => {
    await turnOn(1);
    remote.del.mockRejectedValue(new Error('offline'));
    await renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: /Turn off alerts when closed for Alpha/ })
    );
    expect(await screen.findByText(/Could not turn off/)).toBeInTheDocument();
    expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On');
  });

  it('renders Needs re-authorizing with a Re-authorize action through the same listing', async () => {
    await markAlertsNeedReauth(1);
    await renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('Needs re-authorizing')
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Re-authorize alerts when closed for Alpha/ })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue to EVE' }));
    expect(login.begin).toHaveBeenCalledWith(1, { nearby: false, mail: false });
  });

  it('after a success it carries on with the next queued step, with its own scopes', async () => {
    queueAlertsWalk([{ characterId: 2, nearby: true, mail: false }]);
    await renderSection({ alertsGrant: { status: 'on', characterId: 1, name: 'Alpha' } });
    await waitFor(() => expect(login.begin).toHaveBeenCalledWith(2, { nearby: true, mail: false }));
    expect(await screen.findByText(/Alerts when closed is on for Alpha/)).toBeInTheDocument();
  });

  it('a mismatch names who was authorized and stops the walk', async () => {
    queueAlertsWalk([{ characterId: 2, nearby: false, mail: false }]);
    await renderSection({
      alertsGrant: {
        status: 'mismatch',
        expectedCharacterId: 1,
        authorizedCharacterId: 2,
        authorizedName: 'Beta',
      },
    });
    expect(await screen.findByText(/You authorized Beta, not Alpha/)).toBeInTheDocument();
    expect(login.begin).not.toHaveBeenCalled();
    expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('Off');
  });

  it('says so on a cancel and on a failure', async () => {
    const { unmount } = await renderSection({ alertsGrant: { status: 'cancelled' } });
    expect(await screen.findByText(/cancelled/)).toBeInTheDocument();
    unmount();
    await renderSection({ alertsGrant: { status: 'failed', characterId: 2 } });
    expect(await screen.findByText(/Could not turn on .* Beta/)).toBeInTheDocument();
  });

  it('a grant missing only the mail shows On with what it needs, and Turn off stays', async () => {
    await turnOn(1);
    await takes('alertsMail');
    await seedTokens(1);
    await renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On, needs a login')
    );
    expect(screen.getByText('Needs a login for: new mail.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Turn off alerts when closed for Alpha/ })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Log Alpha in to EVE for alerts when closed' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue to EVE' }));
    expect(login.begin).toHaveBeenCalledWith(1, { nearby: false, mail: true });
  });

  it('never offers a scope the server has not announced', async () => {
    await seedTokens(1, 2);
    await renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Log in 2 characters…' }));
    expect(screen.queryByText(/Mail headers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Location, for nearby/)).not.toBeInTheDocument();
  });
});

describe('Quiet time (issue #4566)', () => {
  it('shows the switch and its help; the times appear only when on', async () => {
    await renderSection();
    const quiet = screen.getByTestId('quiet-time');
    expect(within(quiet).getByText(/No pop-ups from the closed app/)).toBeInTheDocument();
    expect(within(quiet).queryByLabelText('From')).not.toBeInTheDocument();

    await userEvent.click(within(quiet).getByRole('checkbox', { name: 'Quiet time' }));

    expect(await within(quiet).findByLabelText('From')).toHaveValue('22:00');
    expect(within(quiet).getByLabelText('To')).toHaveValue('07:00');
    expect(within(quiet).getByRole('checkbox', { name: 'Let attacks through' })).not.toBeChecked();
  });

  it('turning it off hides the times again', async () => {
    await renderSection();
    const quiet = screen.getByTestId('quiet-time');
    const toggle = within(quiet).getByRole('checkbox', { name: 'Quiet time' });
    await userEvent.click(toggle);
    await within(quiet).findByLabelText('From');
    await userEvent.click(toggle);
    await waitFor(() => expect(within(quiet).queryByLabelText('From')).not.toBeInTheDocument());
  });
});
