import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { markAlertsNeedReauth, readAlertsGrants } from './alertsGrant';
import { queueAlertsForAll } from './alertsGrant';

const characters = [
  { characterId: 1, name: 'Alpha' },
  { characterId: 2, name: 'Beta' },
];

function renderSection(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/settings/notifications', state }]}>
      <AlertsWhenClosedSection characters={characters} />
    </MemoryRouter>
  );
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
  await db.settings.clear();
  login.begin.mockResolvedValue(undefined);
  remote.del.mockResolvedValue(undefined);
});

describe('AlertsWhenClosedSection', () => {
  it('starts every Character off, saying what is stored', async () => {
    renderSection();
    expect(await screen.findByTestId('alerts-state-1')).toHaveTextContent('Off');
    expect(screen.getByTestId('alerts-state-2')).toHaveTextContent('Off');
    expect(screen.getAllByText(/encrypted, notifications-only token/i).length).toBeGreaterThan(1);
  });

  it('Turn on starts the Alerts login for that row', async () => {
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: /Turn on alerts when closed for Beta/ })
    );
    expect(login.begin).toHaveBeenCalledWith(2);
  });

  it('renders On with Turn off, and Turn off deletes the grant', async () => {
    await turnOn(1);
    renderSection();
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
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: /Turn off alerts when closed for Alpha/ })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/Could not turn off/);
    expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On');
  });

  it('renders Needs re-authorizing with a Re-authorize action', async () => {
    await markAlertsNeedReauth(1);
    renderSection();
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
    renderSection();
    // One Character left to authorize: the all-action is not offered.
    await waitFor(() => expect(screen.getByTestId('alerts-state-1')).toHaveTextContent('On'));
    expect(screen.queryByRole('button', { name: 'Turn on for all' })).toBeNull();
  });

  it('Turn on for all steps through Characters one at a time', async () => {
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for all' }));
    expect(login.begin).toHaveBeenCalledTimes(1);
    expect(login.begin).toHaveBeenCalledWith(1);
  });

  it('after a success it carries on with the next queued Character', async () => {
    queueAlertsForAll([2]);
    renderSection({ alertsGrant: { status: 'on', characterId: 1, name: 'Alpha' } });
    await waitFor(() => expect(login.begin).toHaveBeenCalledWith(2));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Alerts when closed is on for Alpha'
    );
  });

  it('a mismatch names who was authorized and stops the walk', async () => {
    queueAlertsForAll([2]);
    renderSection({
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
    const { unmount } = renderSection({ alertsGrant: { status: 'cancelled' } });
    expect(await screen.findByRole('status')).toHaveTextContent(/cancelled/);
    unmount();
    renderSection({ alertsGrant: { status: 'failed', characterId: 2 } });
    expect(await screen.findByRole('status')).toHaveTextContent(/Could not turn on .* Beta/);
  });
});
