import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Approval } from '@/engine/character/finishSetup';
import { FinishSetupHost } from './FinishSetupHost';
import {
  offerFinishSetup,
  readFinishSetup,
  readNotNow,
  useFinishSetupNotNowStore,
} from './finishSetupStore';

const CHAR = 90000007;
const MOON: Approval = {
  kind: 'moon',
  corporationId: 700,
  corporationName: 'Ironvale Reach',
  collectorCorporationId: 500,
  editorCharacterId: 90000001,
};

const beginOwnCorpGrantLogin = vi.fn();
const beginAlertsLogin = vi.fn();
const beginAddCharacterLogin = vi.fn();
vi.mock('@/app/loginFlow', () => ({
  beginOwnCorpGrantLogin: (...a: unknown[]) => beginOwnCorpGrantLogin(...a),
  beginAlertsLogin: (...a: unknown[]) => beginAlertsLogin(...a),
  beginAddCharacterLogin: (...a: unknown[]) => beginAddCharacterLogin(...a),
}));
let items: Approval[] = [];
vi.mock('./loadStillToApprove', () => ({
  loadStillToApprove: async () => ({ name: 'Kestrel Vane', items }),
}));

/** One page load: EVE's return is a fresh mount at a location carrying its result. */
const land = (state?: unknown) => {
  cleanup();
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/characters', state }]}>
      <FinishSetupHost />
    </MemoryRouter>
  );
};

beforeEach(async () => {
  cleanup();
  sessionStorage.clear();
  items = [MOON, { kind: 'alerts', nearby: true, mail: false }];
  for (const fn of [beginOwnCorpGrantLogin, beginAlertsLogin, beginAddCharacterLogin]) {
    fn.mockReset().mockResolvedValue(undefined);
  }
  await useFinishSetupNotNowStore.getState().setValue({});
});

describe('Finish setting up after a sign-in', () => {
  it('shows nothing when there is nothing to approve', async () => {
    items = [];
    offerFinishSetup(CHAR);
    land();
    await waitFor(() => expect(readFinishSetup()).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists the approvals ticked, and Continue runs them in order across EVE redirects', async () => {
    offerFinishSetup(CHAR);
    land();
    expect(
      await screen.findByRole('heading', { name: 'Finish setting up Kestrel Vane' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /Add Ironvale Reach to the moon book/ })
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Alerts when the app is closed/ })).toBeChecked();
    expect(screen.getByText(/It reads EVE notifications and nearby alerts\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(beginOwnCorpGrantLogin).toHaveBeenCalledWith({
      characterId: 90000001,
      expectedCeoCharacterId: CHAR,
      collectorCorporationId: 500,
      feederCorporationId: 700,
      coverageFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });

    land({ ownCorpGrant: { status: 'connected', corporationId: 700 } });
    expect(
      await screen.findByText('Done: Add Ironvale Reach to the moon book.')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve alerts at EVE' }));
    expect(beginAlertsLogin).toHaveBeenCalledWith(CHAR, { nearby: true, mail: false });

    land({ alertsGrant: { status: 'on', characterId: CHAR, name: 'Kestrel Vane' } });
    expect(
      await screen.findByRole('heading', { name: 'Kestrel Vane is set up' })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add another character' }));
    expect(beginAddCharacterLogin).toHaveBeenCalled();
    expect(readFinishSetup()).toBeNull();
  });

  it('a wrong character at EVE approves nothing and returns to the same item', async () => {
    items = [{ kind: 'alerts' }];
    offerFinishSetup(CHAR);
    land();
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    land({
      alertsGrant: {
        status: 'mismatch',
        expectedCharacterId: CHAR,
        authorizedCharacterId: 1,
        authorizedName: 'Dax Orlen',
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You approved as Dax Orlen, so nothing was approved.'
    );
    expect(screen.getByRole('button', { name: 'Approve alerts at EVE' })).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
  });

  it('Not now is remembered for this character and each approval offered', async () => {
    offerFinishSetup(CHAR);
    land();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(async () => expect(await readNotNow(CHAR)).toEqual(['moon', 'alerts']));
    expect(readFinishSetup()).toBeNull();
    expect(beginOwnCorpGrantLogin).not.toHaveBeenCalled();
  });

  it('an approval left unticked at Continue is a Not now for it', async () => {
    offerFinishSetup(CHAR);
    land();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Alerts when the app is closed/ })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(beginOwnCorpGrantLogin).toHaveBeenCalled();
    await waitFor(async () => expect(await readNotNow(CHAR)).toEqual(['alerts']));
  });

  it('a failed Continue says EVE could not be opened', async () => {
    beginOwnCorpGrantLogin.mockRejectedValue(new Error('no'));
    offerFinishSetup(CHAR);
    land();
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText("Could not open EVE's login. Try again.")).toBeInTheDocument();
  });
});
