/**
 * The real `VettingBackend`, over the `vetting` callable router. The pilot's side is public: no
 * Firebase session, proven by the handle's key (and, to read a character, that character's own
 * EVE access token). Officer calls are signed in and carry a fresh access token so the server
 * checks the role live. Only access tokens are ever sent; a refresh token never leaves Dexie.
 *
 * Firebase is reached through `await import()` only, so the public apply page's chunk does not
 * carry the SDK until its first call (`app/bootImportGraph.test.ts`).
 */
import { getValidAccessToken } from '@/auth/session';
import type {
  VettingCorpInfo,
  VettingOverview,
  VettingReview,
  VettingStatus,
} from '@/engine/vetting';
import type { CallableAction } from '../../../../functions/src/callableManifest';
import { vettingBackendOverride, type VettingBackend, type VettingHandle } from './vettingBackend';

const ACTION = {
  corpInfo: 'getVettingCorpCallable',
  start: 'startVettingCallable',
  addCharacter: 'addVettingCharacterCallable',
  removeCharacter: 'removeVettingCharacterCallable',
  submit: 'submitVettingCallable',
  status: 'getVettingStatusCallable',
  withdraw: 'withdrawVettingCallable',
  decline: 'declineVettingCallable',
  myRequests: 'listMyVettingRequestsCallable',
  overview: 'getVettingOverviewCallable',
  open: 'openVettingReviewCallable',
  decide: 'decideVettingReviewCallable',
  request: 'requestVettingReviewCallable',
  createInvite: 'createVettingInviteCallable',
  revokeInvite: 'revokeVettingInviteCallable',
  saveSettings: 'saveVettingSettingsCallable',
} as const satisfies Record<string, CallableAction>;

type VettingAction = (typeof ACTION)[keyof typeof ACTION];

/** The one seam to the `vetting` router. */
async function route<Out>(
  name: VettingAction,
  data: Record<string, unknown>,
  characterId: number | undefined
): Promise<Out> {
  const { callRouted } = await import('@/sync/routedCallable');
  return callRouted<Record<string, unknown>, Out>(name, data, characterId);
}

/** A public call: no session, so no Character's Firebase app is asked for. */
function open<Out>(name: VettingAction, data: Record<string, unknown>): Promise<Out> {
  return route<Out>(name, data, undefined);
}

/** A signed-in call, with the Character's access token for the server's live check. */
async function signedIn<Out>(
  characterId: number,
  name: VettingAction,
  data: Record<string, unknown>
): Promise<Out> {
  const accessToken = await getValidAccessToken(characterId);
  const { ensureSignedIn } = await import('@/sync/syncAuth');
  await ensureSignedIn(characterId);
  return route<Out>(name, { ...data, accessToken }, characterId);
}

const withHandle = (handle: VettingHandle): Record<string, unknown> => ({
  corporationId: handle.corporationId,
  reviewId: handle.reviewId,
  key: handle.key,
});

/** The invite code, only when the link carried one: an absent field, never an empty string. */
const withInvite = (invite: string | undefined): Record<string, unknown> =>
  invite ? { invite } : {};

const client: VettingBackend = {
  corpInfo: (corporationId, invite) =>
    open<VettingCorpInfo>(ACTION.corpInfo, { corporationId, ...withInvite(invite) }),
  start: (corporationId, accessToken, invite) =>
    open(ACTION.start, { corporationId, accessToken, ...withInvite(invite) }),
  addCharacter: (handle, accessToken) =>
    open<VettingStatus>(ACTION.addCharacter, { ...withHandle(handle), accessToken }),
  removeCharacter: (handle, characterId) =>
    open<VettingStatus>(ACTION.removeCharacter, { ...withHandle(handle), characterId }),
  submit: (handle, note, answers) =>
    open<VettingStatus>(ACTION.submit, { ...withHandle(handle), note, answers }),
  status: (handle) => open<VettingStatus>(ACTION.status, withHandle(handle)),
  withdraw: async (handle) => {
    await open<unknown>(ACTION.withdraw, withHandle(handle));
  },
  decline: async (handle) => {
    await open<unknown>(ACTION.decline, withHandle(handle));
  },
  myRequests: (characterId) => signedIn(characterId, ACTION.myRequests, {}),
  overview: (characterId, corporationId) =>
    signedIn<VettingOverview>(characterId, ACTION.overview, { corporationId }),
  open: (characterId, corporationId, reviewId) =>
    signedIn<VettingReview>(characterId, ACTION.open, { corporationId, reviewId }),
  decide: (characterId, corporationId, reviewId, decision, note) =>
    signedIn<VettingReview>(characterId, ACTION.decide, {
      corporationId,
      reviewId,
      decision,
      note,
    }),
  request: (characterId, corporationId, memberName, role) =>
    signedIn<VettingOverview>(characterId, ACTION.request, { corporationId, memberName, role }),
  createInvite: (characterId, corporationId, label) =>
    signedIn<VettingOverview>(characterId, ACTION.createInvite, { corporationId, label }),
  revokeInvite: (characterId, corporationId, code) =>
    signedIn<VettingOverview>(characterId, ACTION.revokeInvite, { corporationId, code }),
  saveSettings: (characterId, corporationId, patch) =>
    signedIn<VettingOverview>(characterId, ACTION.saveSettings, { corporationId, patch }),
};

/** The backend every vetting page calls: the stand-in when a story or e2e installed one. */
export function vettingBackend(): VettingBackend {
  return vettingBackendOverride() ?? client;
}
