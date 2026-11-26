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

class SsoRejection extends Error {
  constructor(readonly code: string) {
    super(`SSO returned ${code}`);
    this.name = 'SsoRejection';
  }
}

export type ErrorKind = LoginFailureReason | 'denied' | 'offline' | 'generic' | null;

const runs = new Map<string, Promise<ErrorKind>>();

let currentNavigate: NavigateFunction | undefined;
const navigateCurrent = ((...args: Parameters<NavigateFunction>) =>
  currentNavigate?.(...args)) as NavigateFunction;

export function resetCallbackRunsForTests(): void {
  runs.clear();
  currentNavigate = undefined;
}

function runCallback(search: string, navigate: NavigateFunction): Promise<ErrorKind> {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  const ssoError = params.get('error');

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
      offerFinishSetup(character.characterId);
      try {
        const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
        if (activeCharacterId === null) await setActiveCharacter(character.characterId);
      } catch {}
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
      if (isOfflineFailure(err)) return 'offline';
      if (await retryLastLoginOnce().catch(() => false)) return null;
      return err instanceof LoginError ? err.reason : 'generic';
    });
}

export function callbackRun(search: string, navigate: NavigateFunction): Promise<ErrorKind> {
  currentNavigate = navigate;
  let run = runs.get(search);
  if (run === undefined) {
    run = runCallback(search, navigateCurrent);
    runs.set(search, run);
  }
  return run;
}
