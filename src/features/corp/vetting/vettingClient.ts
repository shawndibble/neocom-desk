import { isSyncConfigured } from '@/app/syncStatus';
import { getValidAccessToken } from '@/auth/session';
import type {
  VettingCorpInfo,
  VettingOverview,
  VettingRawPage,
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
  rawRows: 'getVettingRawRowsCallable',
  decide: 'decideVettingReviewCallable',
  request: 'requestVettingReviewCallable',
  recordRequestMail: 'recordVettingRequestMailCallable',
  createInvite: 'createVettingInviteCallable',
  revokeInvite: 'revokeVettingInviteCallable',
  saveSettings: 'saveVettingSettingsCallable',
} as const satisfies Record<string, CallableAction>;

type VettingAction = (typeof ACTION)[keyof typeof ACTION];

async function route<Out>(
  name: VettingAction,
  data: Record<string, unknown>,
  characterId: number | undefined
): Promise<Out> {
  const { callRouted } = await import('@/sync/routedCallable');
  return callRouted<Record<string, unknown>, Out>(name, data, characterId);
}

function open<Out>(name: VettingAction, data: Record<string, unknown>): Promise<Out> {
  return route<Out>(name, data, undefined);
}

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
  myRequests: async (characterId) =>
    isSyncConfigured() ? signedIn(characterId, ACTION.myRequests, {}) : [],
  overview: (characterId, corporationId) =>
    signedIn<VettingOverview>(characterId, ACTION.overview, { corporationId }),
  open: (characterId, corporationId, reviewId) =>
    signedIn<VettingReview>(characterId, ACTION.open, { corporationId, reviewId }),
  rawRows: (characterId, corporationId, reviewId, source, cursor) =>
    signedIn<VettingRawPage>(characterId, ACTION.rawRows, {
      corporationId,
      reviewId,
      source,
      ...(cursor ? { cursor } : {}),
    }),
  decide: (characterId, corporationId, reviewId, decision, note) =>
    signedIn<VettingReview>(characterId, ACTION.decide, {
      corporationId,
      reviewId,
      decision,
      note,
    }),
  request: (characterId, corporationId, memberName, role) =>
    signedIn<VettingOverview>(characterId, ACTION.request, { corporationId, memberName, role }),
  recordRequestMail: (characterId, corporationId, reviewId) =>
    signedIn<VettingOverview>(characterId, ACTION.recordRequestMail, { corporationId, reviewId }),
  createInvite: (characterId, corporationId, label) =>
    signedIn<VettingOverview>(characterId, ACTION.createInvite, { corporationId, label }),
  revokeInvite: (characterId, corporationId, code) =>
    signedIn<VettingOverview>(characterId, ACTION.revokeInvite, { corporationId, code }),
  saveSettings: (characterId, corporationId, patch) =>
    signedIn<VettingOverview>(characterId, ACTION.saveSettings, { corporationId, patch }),
};

export function vettingBackend(): VettingBackend {
  return vettingBackendOverride() ?? client;
}
