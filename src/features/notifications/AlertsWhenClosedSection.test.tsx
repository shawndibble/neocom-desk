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
import { queueAlertsForAll } from './alertsGrant';

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

  it('closed, it counts the Characters that are on and the ones needing re-auth', async () => {
    await db.settings.put({
      key: 'alertsGrants',
      value: {
        1: { status: 'active', enabledAt: 1 },
        2: { status: 'needs-reauth', enabledAt: 1 },
      },
    });
    await renderSection(undefined, { open: false });
    expect(await screen.findByText(/1 of 2 characters/)).toBeInTheDocument();
    expect(screen.getByText(/1 needs re-authorizing/)).toBeInTheDocument();
  });

  it('starts every Character off, saying what is stored', async () => {
    await renderSection();
    expect(await screen.findByTestId('alerts-state-1')).toHaveTextContent('Off');
    expect(screen.getByTestId('alerts-state-2')).toHaveTextContent('Off');
    expect(screen.getAllByText(/encrypted, notifications-only token/i).length).toBeGreaterThan(1);
  });

  it('Turn on starts the Alerts login for that row', async () => {
    await renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: /Turn on alerts when closed for Beta/ })
    );
    expect(login.begin).toHaveBeenCalledWith(2);
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
    expect(await screen.findByRole('status')).toHaveTextContent(/Could not turn off/);
    expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On');
  });

  it('renders Needs re-authorizing with a Re-authorize action', async () => {
    await markAlertsNeedReauth(1);
    await renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('Needs re-authorizing')
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Re-authorize alerts when closed for Alpha/ })
    );
    expect(login.begin).toHaveBeenCalledWith(1);
  });

  it('Turn on for all starts with the first Character that is not on', async () => {
    await turnOn(1);
    await renderSection();
    // One Character left to authorize: the all-action is not offered.
    await waitFor(() => expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On'));
    expect(screen.queryByRole('button', { name: 'Turn on for all' })).toBeNull();
  });

  it('Turn on for all steps through Characters one at a time', async () => {
    await renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for all' }));
    expect(login.begin).toHaveBeenCalledTimes(1);
    expect(login.begin).toHaveBeenCalledWith(1);
  });

  it('after a success it carries on with the next queued Character', async () => {
    queueAlertsForAll([2]);
    await renderSection({ alertsGrant: { status: 'on', characterId: 1, name: 'Alpha' } });
    await waitFor(() => expect(login.begin).toHaveBeenCalledWith(2));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Alerts when closed is on for Alpha'
    );
  });

  it('a mismatch names who was authorized and stops the walk', async () => {
    queueAlertsForAll([2]);
    await renderSection({
      alertsGrant: {
        status: 'mismatch',
        expectedCharacterId: 1,
        authorizedCharacterId: 2,
        authorizedName: 'Beta',
      },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/You authorized Beta, not Alpha/);
    expect(login.begin).not.toHaveBeenCalled();
    expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('Off');
  });

  it('says so on a cancel and on a failure', async () => {
    const { unmount } = await renderSection({ alertsGrant: { status: 'cancelled' } });
    expect(await screen.findByRole('status')).toHaveTextContent(/cancelled/);
    unmount();
    await renderSection({ alertsGrant: { status: 'failed', characterId: 2 } });
    expect(await screen.findByRole('status')).toHaveTextContent(/Could not turn on .* Beta/);
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

describe('AlertsWhenClosedSection: mail alerts (ADR 0029)', () => {
  it('says nothing about mail until the server takes the mail scope', async () => {
    await turnOn(1);
    await renderSection();
    expect(await screen.findByTestId('alerts-state-1')).toHaveTextContent(/^On$/);
    expect(screen.queryByRole('button', { name: /add mail/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/mail headers/)).not.toBeInTheDocument();
  });

  it('offers Add mail to a grant without it, says what it will read, and asks for mail only on that press', async () => {
    await turnOn(1);
    await db.settings.put({ key: 'alertsMail', value: { supported: true, characterIds: [] } });
    await renderSection();
    expect(await screen.findByText(/never the message/)).toBeInTheDocument();
    expect(
      screen.getByText('Our server holds an encrypted token that reads only notifications.')
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Re-authorize Alpha to add new-mail alerts (reads mail headers only)',
      })
    );
    expect(login.begin).toHaveBeenCalledWith(1, { add: 'mail' });
  });

  it('a plain Turn on never asks for mail, even once the server takes it', async () => {
    await db.settings.put({ key: 'alertsMail', value: { supported: true, characterIds: [] } });
    await renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Turn on alerts when closed for Alpha' })
    );
    expect(login.begin).toHaveBeenCalledWith(1);
  });

  it('shows what a grant with mail reads, and no longer offers Add mail', async () => {
    await turnOn(1);
    await db.settings.put({ key: 'alertsMail', value: { supported: true, characterIds: [1] } });
    await db.settings.put({ key: 'alertsNearby', value: { supported: true, characterIds: [1] } });
    await renderSection();
    expect(
      await screen.findByText(
        'Our server holds an encrypted token that reads only notifications, location, and mail headers.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add mail/i })).not.toBeInTheDocument();
  });
});

describe('AlertsWhenClosedSection: nearby alerts (ADR 0028)', () => {
  it('says nothing about nearby alerts until the server takes the location scope', async () => {
    await turnOn(1);
    await renderSection();
    expect(await screen.findByTestId('alerts-state-1')).toHaveTextContent(/^On$/);
    expect(screen.queryByRole('button', { name: /add nearby/i })).not.toBeInTheDocument();
    expect(screen.getByText(/notifications only; Turn off/)).toBeInTheDocument();
  });

  it('offers to re-authorize a grant from before nearby alerts, and says what it covers', async () => {
    await turnOn(1);
    await db.settings.put({ key: 'alertsNearby', value: { supported: true, characterIds: [] } });
    await renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On, without nearby alerts')
    );
    expect(
      screen.getByText(/nearby Incursions and raidable skyhooks, while the app is closed/)
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Re-authorize Alpha to add nearby Incursions and raidable skyhooks',
      })
    );
    expect(login.begin).toHaveBeenCalledWith(1);
  });

  it('shows a grant that already carries the location as plainly on', async () => {
    await turnOn(1);
    await db.settings.put({ key: 'alertsNearby', value: { supported: true, characterIds: [1] } });
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('alerts-state-1')).toHaveTextContent(/^On$/));
    expect(screen.queryByRole('button', { name: /add nearby/i })).not.toBeInTheDocument();
  });
});
