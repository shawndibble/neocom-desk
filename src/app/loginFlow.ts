import {
  startAlertsLogin,
  startCorpSyncLogin,
  startFeederGrantLogin,
  startOwnCorpGrantLogin,
  startVettingLogin,
  startLogin,
  scopesForRetry,
  takeRetryBudget,
} from '@/auth/session';
import { clearLoginReturnTo, setLoginReturnTo, takeLoginReturnTo } from '@/auth/loginReturnTo';
import { CORE_GRANT, DEFAULT_ON_GROUPS, SCOPES, scopesForGroup } from '@/esi/scopes';
import type { ScopeGroup } from '@/esi/registry';
import type { AlertsExtraState } from '@/features/notifications/alertsGrant';
import { readCustomizeSelection } from '@/features/permissions/customizeSelection';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { assignLocation } from './navigation';
import { currentRouterPath, isOnRoute } from './routerPath';
import { loadGrantedScopes } from './grantedScopes';

export interface EveLoginOptions {
  characterId?: number;
  groups?: readonly ScopeGroup[];
}

async function requestedScopes(
  characterId: number | null,
  groups: readonly ScopeGroup[]
): Promise<string[]> {
  if (characterId === null) return [...new Set(SCOPES)];
  const named = [...CORE_GRANT, ...groups.flatMap((group) => [...scopesForGroup(group)])];
  const fill = await defaultOnFill();
  try {
    return [...new Set([...named, ...fill, ...(await loadGrantedScopes(characterId))])];
  } catch {
    return [...new Set([...named, ...fill])];
  }
}

async function defaultOnFill(): Promise<string[]> {
  try {
    const chosen = new Set(await readCustomizeSelection());
    return DEFAULT_ON_GROUPS.filter((group) => chosen.has(group)).flatMap((group) => [
      ...scopesForGroup(group),
    ]);
  } catch {
    return [];
  }
}

export async function beginEveLogin(options: EveLoginOptions = {}): Promise<void> {
  const characterId = options.characterId ?? useActiveCharacter.getState().activeCharacterId;
  rememberThisPage();
  assignLocation(await startLogin(await requestedScopes(characterId, options.groups ?? [])));
}

export async function beginAlertsLogin(
  characterId: number,
  { nearby = true, mail = false }: { nearby?: boolean; mail?: boolean } = {}
): Promise<void> {
  const { readAlertsNearby, readAlertsMail } = await import('@/features/notifications/alertsGrant');
  const none = (): AlertsExtraState => ({ supported: false, characterIds: [] });
  const nearbyState = await readAlertsNearby().catch(none);
  const mailState = await readAlertsMail().catch(none);
  rememberThisPage();
  assignLocation(
    await startAlertsLogin(characterId, undefined, {
      nearby: nearbyState.supported && (nearby || nearbyState.characterIds.includes(characterId)),
      mail: mailState.supported && (mail || mailState.characterIds.includes(characterId)),
    })
  );
}

export async function beginCorpSyncLogin(
  characterId: number,
  corporationId: number
): Promise<void> {
  rememberThisPage();
  assignLocation(await startCorpSyncLogin(characterId, corporationId));
}

export async function beginVettingLogin(corporationId: number, reviewId?: string): Promise<void> {
  rememberThisPage();
  assignLocation(await startVettingLogin(corporationId, reviewId));
}

export async function beginFeederGrantLogin(
  characterId: number,
  inviteCode: string,
  requestedRatePct?: number
): Promise<void> {
  rememberThisPage();
  assignLocation(await startFeederGrantLogin(characterId, inviteCode, requestedRatePct));
}

export async function beginOwnCorpGrantLogin(
  intent: Parameters<typeof startOwnCorpGrantLogin>[0]
): Promise<void> {
  rememberThisPage();
  assignLocation(await startOwnCorpGrantLogin(intent));
}

function rememberThisPage(): void {
  const here = currentRouterPath();
  if (here.startsWith('//') || isOnRoute(here, '/callback')) return;
  setLoginReturnTo(here);
}

const LANDING_KEEPING_ROUTES = [
  '/login',
  '/callback',
  '/s',
  '/share',
  '/communities/join',
  '/corp-tax-book/verify',
  '/corp-tax-book/remove-now',
];

function forgetStrayLanding(): void {
  const here = currentRouterPath();
  if (!LANDING_KEEPING_ROUTES.some((route) => isOnRoute(here, route))) clearLoginReturnTo();
}

export async function beginAddCharacterLogin(): Promise<void> {
  forgetStrayLanding();
  assignLocation(await startLogin(await requestedScopes(null, [])));
}

export async function beginCustomizedAddCharacterLogin(
  groups: readonly ScopeGroup[]
): Promise<void> {
  const scopes = [...new Set([...CORE_GRANT, ...groups.flatMap((group) => scopesForGroup(group))])];
  forgetStrayLanding();
  assignLocation(await startLogin(scopes));
}

export async function retryLastLogin(): Promise<boolean> {
  const scopes = scopesForRetry();
  if (!scopes) return false;
  const landing = takeLoginReturnTo();
  if (landing !== null) setLoginReturnTo(landing);
  assignLocation(await startLogin(scopes));
  return true;
}

export async function retryLastLoginOnce(): Promise<boolean> {
  return takeRetryBudget() ? retryLastLogin() : false;
}
