// The login callback's work, outside the component so every mount of one URL shares it.
import type { NavigateFunction } from 'react-router-dom';
import { addCharacter } from '@/features/character/addCharacter';
import { offerFinishSetup } from '@/features/character/finishSetup/finishSetupStore';
import {
  LoginError,
  completeVettingLogin,
  loginIntentFor,
  clearLoginIntent,
  clearLoginRecovery,
  type LoginFailureReason,
} from '@/auth/session';
import { takeLoginReturnTo } from '@/auth/loginReturnTo';
import {
  clearAlertsQueue,
  completeAlertsGrant,
  type AlertsCallbackState,
  type AlertsGrantOutcome,
} from '@/features/notifications/alertsGrant';
import {
  completeFeederGrant,
  type FeederGrantCallbackState,
  type FeederGrantOutcome,
} from '@/features/corp/taxBook/feederGrant';
import {
  completeOwnCorpGrant,
  type OwnCorpGrantCallbackState,
  type OwnCorpGrantOutcome,
} from '@/features/corp/taxBook/ownCorpGrant';
import {
  completeCorpSyncGrant,
  type CorpSyncCallbackState,
  type CorpSyncGrantOutcome,
} from '@/features/corp/taxBook/syncGrant';
import {
  holdVettingLogin,
  type VettingLoginOutcome,
} from '@/features/corp/vetting/vettingLoginState';
import { retryLastLoginOnce } from '@/app/loginFlow';
import { isOfflineFailure } from '@/esi/client';
import { callableErrorReason } from '@/lib/callableError';
import { reportFailure } from '@/observability/reportFailure';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * SSO refused rather than the exchange failing — `?error=` on the callback.
 * Carried as a throw so it joins the one failure path, and marked terminal
 * there: the commonest cause is the user pressing Cancel.
 */
class SsoRejection extends Error {
  constructor(readonly code: string) {
    super(`SSO returned ${code}`);
    this.name = 'SsoRejection';
  }
}

/** Which wording the panel shows; `null` while the callback is still working. */
export type ErrorKind = LoginFailureReason | 'denied' | 'offline' | 'generic' | null;

/**
 * Each callback URL's one run, kept for the page's life. A remount of the route (App's
 * `Suspense` is keyed on the number format, which loads after the first paint) mounts a fresh
 * `Callback` while the first one's exchange is in flight: it must wait for that run, not start
 * another, which would find the one-time PKCE stash spent and show "already used" over a login
 * that succeeds (and whose success then takes the page the user came from).
 */
const runs = new Map<string, Promise<ErrorKind>>();

/** Forgets every run: each test renders a callback as a fresh page load. */
export function forgetCallbackRuns(): void {
  runs.clear();
}

/** Handles one callback URL: navigates away and resolves null, or resolves the error to show. */
function runCallback(search: string, navigate: NavigateFunction): Promise<ErrorKind> {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  const ssoError = params.get('error');

  // An Alerts Grant round trip (ADR 0020) is not a login: no Character is
  // added, no token is stored on this device, and every outcome — including
  // a cancel or a failure — goes back to the Settings row that was pressed
  // rather than to an error panel that would offer to restart it as one.
  const intent = state ? loginIntentFor(state) : undefined;
  if (intent?.kind === 'alerts') {
    const land = (alertsGrant: AlertsCallbackState['alertsGrant']) => {
      if (alertsGrant.status !== 'on') clearAlertsQueue();
      navigate(takeLoginReturnTo() ?? '/settings/notifications', {
        replace: true,
        state: { alertsGrant } satisfies AlertsCallbackState,
      });
    };
    if (ssoError || !code || !state) {
      land({ status: 'cancelled' });
      return Promise.resolve(null);
    }
    return completeAlertsGrant({ code, state })
      .catch((): AlertsGrantOutcome => ({
        status: 'failed',
        characterId: intent.characterId,
      }))
      .then(land)
      .then(() => null);
  }

  // The Corp Tax Book's Automatic sync grant (ADR 0025) is the same kind of
  // round trip: nothing is stored here, and every outcome goes back to the book.
  if (intent?.kind === 'corpSync') {
    const land = (corpSyncGrant: CorpSyncCallbackState['corpSyncGrant']) => {
      navigate(takeLoginReturnTo() ?? '/corp/moons', {
        replace: true,
        state: { corpSyncGrant } satisfies CorpSyncCallbackState,
      });
    };
    if (ssoError || !code || !state) {
      land({ status: 'cancelled' });
      return Promise.resolve(null);
    }
    return completeCorpSyncGrant({ code, state })
      .catch((): CorpSyncGrantOutcome => ({
        status: 'failed',
        characterId: intent.characterId,
      }))
      .then(land)
      .then(() => null);
  }

  // A moon owner's grant is the same kind of round trip, and lands back on the Moons page.
  if (intent?.kind === 'feederGrant') {
    const land = (feederGrant: FeederGrantCallbackState['feederGrant']) => {
      navigate(takeLoginReturnTo() ?? '/corp/moons', {
        replace: true,
        state: { feederGrant } satisfies FeederGrantCallbackState,
      });
    };
    if (ssoError || !code || !state) {
      land({ status: 'cancelled' });
      return Promise.resolve(null);
    }
    return completeFeederGrant({ code, state })
      .catch((): FeederGrantOutcome => ({ status: 'failed' }))
      .then(land)
      .then(() => null);
  }

  // Connecting one of the player's own CEO corporations: the same kind of round trip.
  if (intent?.kind === 'ownCorpGrant') {
    const corporationId = intent.feederCorporationId;
    const land = (ownCorpGrant: OwnCorpGrantOutcome) => {
      navigate(takeLoginReturnTo() ?? '/corp/moons', {
        replace: true,
        state: { ownCorpGrant } satisfies OwnCorpGrantCallbackState,
      });
    };
    if (ssoError || !code || !state) {
      land({ status: 'cancelled', corporationId });
      return Promise.resolve(null);
    }
    return completeOwnCorpGrant({ code, state })
      .catch((error: unknown): OwnCorpGrantOutcome => {
        // Without this the real cause (a missing server action, a rejected token) was
        // swallowed and read as "log in again".
        reportFailure('auth', error);
        return {
          status: 'refused',
          corporationId,
          reason: callableErrorReason(error) ?? 'unknown',
        };
      })
      .then(land)
      .then(() => null);
  }

  // A Vetting sign-in reads one character for a corp's report: no Character is added and
  // nothing is stored. The access token is held in module memory for the page to take once
  // (`vettingLoginState.ts`), never in router or history state, which outlives the page and is
  // copied with the tab; `completeVettingLogin` has already dropped the refresh token.
  if (intent?.kind === 'vetting') {
    const land = (vettingLogin: VettingLoginOutcome) => {
      holdVettingLogin(vettingLogin);
      navigate(takeLoginReturnTo() ?? `/apply/${intent.corporationId}`, { replace: true });
    };
    if (ssoError || !code || !state) {
      land({ status: 'cancelled' });
      return Promise.resolve(null);
    }
    return completeVettingLogin({ code, state })
      .then(
        ({ accessToken, characterId, name }): VettingLoginOutcome => ({
          status: 'ok',
          accessToken,
          characterId,
          name,
        }),
        (): VettingLoginOutcome => ({ status: 'failed' })
      )
      .then(land)
      .then(() => null);
  }

  return Promise.resolve()
    .then(() => {
      if (ssoError) throw new SsoRejection(ssoError);
      if (!code || !state) throw new Error('missing code or state param');
      return addCharacter({ code, state });
    })
    .then(async ({ character, firstEver }) => {
      clearLoginRecovery();
      // The Character's other approvals at EVE, offered on the page this lands on (#6103).
      offerFinishSetup(character.characterId);
      // Past this point the Character and its token are in Dexie, so the
      // login has happened; a throw from anything below must not put an
      // error panel over it (`features/character/addCharacter` makes the
      // same trade one layer down).
      try {
        // First login becomes the active character automatically.
        const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
        if (activeCharacterId === null) await setActiveCharacter(character.characterId);
      } catch {
        // A Character nobody has selected yet is worth far less than the
        // session; /characters is where one is picked anyway.
      }
      // A Fitting Share Code's "Open in Neocom Desk" (#1544) stashed where
      // to land before sending this login to SSO; every other entry point
      // leaves nothing there, so this is the ordinary `/characters` most of
      // the time. A first-ever login has exactly one Character, so the list
      // has nothing to choose between and Overview is the useful landing
      // (#1771); adding an alt still gets the list.
      navigate(takeLoginReturnTo() ?? (firstEver ? '/overview' : '/characters'), {
        replace: true,
      });
      return null;
    })
    .catch(async (err: unknown): Promise<ErrorKind> => {
      if (err instanceof SsoRejection) {
        clearLoginIntent();
        return err.code === 'access_denied' ? 'denied' : 'generic';
      }
      // The exchange never reached SSO: nothing is wrong with the login, and
      // restarting it would only navigate to the browser's offline page.
      if (isOfflineFailure(err)) return 'offline';
      if (await retryLastLoginOnce().catch(() => false)) return null;
      return err instanceof LoginError ? err.reason : 'generic';
    });
}

/** The one run of callback URL `search`, started by its first mount and shared by every later one. */
export function callbackRun(search: string, navigate: NavigateFunction): Promise<ErrorKind> {
  let run = runs.get(search);
  if (run === undefined) {
    run = runCallback(search, navigate);
    runs.set(search, run);
  }
  return run;
}
