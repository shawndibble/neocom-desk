// mintFirebaseToken: exchange a verified EVE access token for a Firebase
// custom token. The EVE *refresh* token never reaches this backend (ADR 0001);
// the client sends only its short-lived access token, which is verified
// against EVE's published JWKS before any Firebase credential is minted.

import { onCall, HttpsError, type CallableOptions } from 'firebase-functions/v2/https';
import { createActionGroup, type CallableHandler } from './callableRouter.js';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { error as logError, info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { firestore } from './firestore.js';
import { runPurgeNotificationFeed, runPurgeStaleAccounts } from './purgeJobs.js';
import { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, r2ConfigOrThrow } from './r2Publish.js';
import { openPricesR2Key } from './r2DailySnapshots.js';
import { createR2Get } from './r2Publisher.js';
import { runSyncActiveWars } from './activeWarsJob.js';
import { runSyncLawlessSystems, runSyncMarketOpenPrices } from './marketHistoryJob.js';
import {
  runSyncLpStoreOffers,
  runSyncPublicContractOffers,
  runSyncWorkbenchFits,
} from './snapshotJobs.js';
import {
  verifyEveAccessToken,
  verifyOptionsFromEnv,
  uidForCharacter,
  characterIdForUid,
  type EveTokenClaims,
} from './verifyEveToken.js';
import {
  AlertGrantError,
  deleteAlertGrant as deleteAlertGrantFor,
  parseSaveAlertGrantInput,
  refreshAtSso,
  revokeAtSso,
  saveAlertGrant as saveAlertGrantFor,
  type AlertGrantDeps,
} from './alertGrant.js';
import { parseAlertsKey } from './alertGrantCrypto.js';
import { firestoreAlertGrantStore, firestorePollerStore } from './alertGrantStore.js';
import { fetchNotifications as fetchEsiNotifications } from './esiNotifications.js';
import { pollEveNotifications as pollEveNotificationsRun } from './pollEveNotifications.js';
import { buildDeviceRegistration, parseRegisterDeviceInput } from './registerDevice.js';
import { dispatchDueProjections, writeDeviceRegistration } from './projectionStore.js';
import {
  parseBookCall,
  parseClaimPaymentInput,
  parseConfirmGroupingInput,
  parseDeclineByTokenInput,
  parseEditAction,
  parseStopReminders,
  parseSyncInput,
  parseToken,
  parseTurnOnInput,
} from './corpTaxBook.js';
import {
  esiCorporationCeoLookup,
  esiIdCategoryLookup,
  esiCorporationLookup,
  esiIdentityReader,
} from './corpTaxBookEsi.js';
import {
  parseSaveCorpSyncGrantInput,
  revokeCorpSyncGrant,
  runScheduledCorpSyncs,
  saveCorpSyncGrant,
  type CorpSyncDeps,
} from './corpSyncGrant.js';
import {
  acceptFeederInvite,
  createFeederInvite,
  parseAcceptFeederInviteInput,
  parseCreateFeederInviteInput,
  parsePreviewFeederInviteInput,
  parseRevokeFeederInviteInput,
  previewFeederInvite,
  revokeFeederInvite,
} from './corpTaxBookFeeders.js';
import {
  dropBookGrants,
  getFeederStatus,
  leaveFeeder,
  parseFeederCall,
  parseSaveFeederGrantInput,
  saveFeederGrant,
} from './corpTaxBookFeederGrant.js';
import {
  dismissFeederHistory,
  getFeederViewAccess,
  parseRequestFeederRateInput,
  requestFeederRate,
} from './corpTaxBookFeederViewCalls.js';
import {
  parseSetBookFeederPayeeInput,
  parseSetFeederPayeeInput,
  setBookFeederPayee,
  setFeederPayee,
} from './corpTaxBookPayee.js';
import {
  markFeederPayout,
  parseMarkPayoutInput,
  parseReconcilePayoutsInput,
  parseRecordPayoutInput,
  reconcileFeederPayoutsCall,
  recordFeederPayout,
} from './corpTaxBookFeederPayouts.js';
import {
  listFeederInvites,
  parseSetFeederModeInput,
  parseSetFeederRateInput,
  setFeederMode,
  setFeederRate,
} from './corpTaxBookFeederOwnerCalls.js';
import {
  learnRefinerySystems,
  parseLearnRefinerySystemsInput,
  parseSetOwnRefineryLabelInput,
  parseSetRefineryLabelInput,
  setOwnRefineryLabel,
  setRefineryLabel,
} from './corpTaxBookRefineryLabels.js';
import {
  cancelFeederRemoval,
  finalizeDueRemovals,
  forceRemovalNow,
  getRemovalLink,
  parseRemovalCall,
  parseRemovalLinkCall,
  parseRemovalNoticeCall,
  recordRemovalSent,
  startFeederRemoval,
} from './corpTaxBookFeederRemoval.js';
import { esiSyncReader } from './corpTaxBookSyncEsi.js';
import {
  claimPayment,
  confirmGrouping,
  declineGrouping,
  declineGroupingByToken,
  listPendingGroupings,
  editBook,
  readStatementByToken,
  deleteBook,
  reclaimBook,
  setRemindersByToken,
  syncBook,
  turnOnBook,
  verifyOfficer,
  type BookDeps,
} from './corpTaxBookStore.js';
import {
  parseCommunityIdInput,
  parseCreateInput,
  parseJoinInput,
  parseJoinRequestDecisionInput,
  parseMailInviteInput,
  parsePreviewInput,
  parseRemoveMemberInput,
  parseRequireApprovalInput,
  parseTransferAdminInput,
} from './communities.js';
import {
  createCommunity,
  decideJoinRequest,
  deleteCommunity,
  joinCommunity,
  confirmMailInvite,
  leaveCommunity,
  previewCommunity,
  regenerateInvite,
  releaseMailInvite,
  removeMember,
  reserveMailInvite,
  revokeInvite,
  setRequireApproval,
  transferAdmin,
  type CallerCharacter,
} from './communitiesStore.js';
import {
  parseEditRequestInput,
  parsePostRequestInput,
  parseRemovePledgeInput,
  parseRequestIdInput,
  parseSetClosedInput,
} from './communityRequests.js';
import {
  confirmPledgeMail,
  editRequest,
  extendRequest,
  postRequest,
  releasePledgeMail,
  reservePledgeMail,
  setRequestClosed,
} from './communityRequestsStore.js';
import { removePledge, removeRequest, sweepRequests } from './communityRequestsCleanup.js';
import {
  MutamarketBusyError,
  MutamarketInputError,
  MutamarketProxy,
  MutamarketUnavailableError,
  parseEstimateInput,
} from './mutamarket.js';

initializeApp();

// Built at cold start so a missing EVE_CLIENT_ID fails deployment/startup
// loudly instead of silently accepting any EVE app's tokens per request.
// The Firebase emulator's discovery pass loads this module without the env
// files (the running functions get them), so only there a missing id is allowed.
const verifyOptions = verifyOptionsFromEnv({
  allowMissingClientId: process.env.FUNCTIONS_EMULATOR === 'true',
});

export const mintFirebaseToken = onCall<{ accessToken?: unknown }>(
  // Hobby-scale abuse cap; also bounds the JWKS fetch fan-out.
  { maxInstances: 5 },
  async (request) => {
    const accessToken = request.data?.accessToken;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new HttpsError('invalid-argument', 'accessToken (string) is required');
    }

    let claims: EveTokenClaims;
    try {
      claims = await verifyEveAccessToken(accessToken, verifyOptions);
    } catch (err) {
      // Client response stays opaque (don't leak which validation step
      // failed), but the real cause still needs to be diagnosable from Cloud
      // Logging — the previous bare `catch {}` discarded it entirely.
      logError('EVE access token rejected', { error: err instanceof Error ? err.message : err });
      throw new HttpsError('unauthenticated', 'EVE access token rejected');
    }

    const uid = uidForCharacter(claims.characterId);
    // ownerHash rides along as a custom claim; Firestore rules compare it to the
    // ownerHash field on each doc so a transferred character can't read the
    // previous owner's data.
    const token = await getAuth().createCustomToken(uid, { ownerHash: claims.ownerHash });
    return { token, uid, ownerHash: claims.ownerHash };
  }
);

// registerDevice: register one device's FCM token against every Character it
// holds, in one call — see registerDevice.ts and issue #356. Firestore rules
// deny all client access to `deviceRegistrations`; this admin write is the
// only path in. The doc is a wholesale `set` keyed by the device's own
// (client-generated, device-local) id, never a token-keyed doc — that is what
// makes re-registering after an FCM token rotation replace the entry instead
// of accumulating one per token.
export const registerDevice = onCall<unknown>({ maxInstances: 5 }, async (request) => {
  let input;
  try {
    input = parseRegisterDeviceInput(request.data);
  } catch (err) {
    throw new HttpsError(
      'invalid-argument',
      err instanceof Error ? err.message : 'Invalid request body'
    );
  }

  const { registration, rejected, projections, eveTypesByCharacter } =
    await buildDeviceRegistration(input, verifyOptions, logError);

  if (registration.characterIds.length === 0) {
    throw new HttpsError('unauthenticated', 'No character access token could be verified');
  }

  await writeDeviceRegistration(firestore(), {
    deviceId: input.deviceId,
    fcmToken: registration.fcmToken,
    characterIds: registration.characterIds,
    projections,
    eveTypesByCharacter,
    quietHours: input.quietHours,
  });

  // The types the server has seen for each Character (alertGrants, ADR 0020),
  // so the client can offer a toggle for them. Only `seenTypes` is read out.
  const { store } = alertGrantDeps();
  const seenTypes: Record<string, string[]> = {};
  await Promise.all(
    registration.characterIds.map(async (characterId) => {
      try {
        seenTypes[String(characterId)] = (await store.get(characterId))?.seenTypes ?? [];
      } catch (err) {
        // The registration already landed; a failed read only delays new toggles.
        logError('Device registration: seenTypes read failed', { characterId, error: String(err) });
      }
    })
  );

  return { deviceId: input.deviceId, registered: registration.characterIds, rejected, seenTypes };
});

// Alerts Grant custody (issue #3753, ADR 0020). `ALERTS_TOKEN_KEY` is a Firebase
// secret (base64, 32 bytes): `firebase functions:secrets:set ALERTS_TOKEN_KEY`.
// Nothing here logs or returns a token; firestore.rules denies `alertGrants`.
const ALERTS_TOKEN_KEY = defineSecret('ALERTS_TOKEN_KEY');

function alertGrantDeps(): AlertGrantDeps {
  return {
    store: firestoreAlertGrantStore(firestore()),
    key: () => parseAlertsKey(ALERTS_TOKEN_KEY.value()),
    verify: (accessToken) => verifyEveAccessToken(accessToken, verifyOptions),
    refresh: (clientId, refreshToken) => refreshAtSso(clientId, refreshToken),
    revoke: (clientId, refreshToken) => revokeAtSso(clientId, refreshToken),
    now: () => Date.now(),
    log: (message, data) => logWarn(message, data),
  };
}

function alertGrantHttpsError(err: unknown): never {
  if (err instanceof AlertGrantError) throw new HttpsError(err.code, err.message);
  // Opaque: the cause could sit next to key material, so log the name only.
  logError('Alerts Grant call failed', { error: err instanceof Error ? err.name : 'unknown' });
  throw new HttpsError('internal', 'Alerts Grant call failed');
}

// The device's full-scope session is not involved: the callable's proof is the
// notifications-only access token itself, verified like registerDevice does.
export const saveAlertGrant = onCall<unknown>(
  { maxInstances: 5, secrets: [ALERTS_TOKEN_KEY] },
  async (request) => {
    try {
      return await saveAlertGrantFor(alertGrantDeps(), parseSaveAlertGrantInput(request.data));
    } catch (err) {
      return alertGrantHttpsError(err);
    }
  }
);

// Deleting needs the Character's own signed-in session, so one Character
// cannot drop another's grant.
export const deleteAlertGrant = onCall<unknown>(
  { maxInstances: 5, secrets: [ALERTS_TOKEN_KEY] },
  async (request) => {
    const { uid } = callerOf(request);
    try {
      return await deleteAlertGrantFor(alertGrantDeps(), characterIdForUid(uid)!);
    } catch (err) {
      return alertGrantHttpsError(err);
    }
  }
);

/**
 * dispatchProjections: fires whatever is due (issue #358, ADR 0010,
 * GLOSSARY.md round 45). Runs every 5 minutes, matching the Foreground
 * Poller's own cadence (`POLL_INTERVAL_MS`). One of this deployment's two
 * Cloud Scheduler jobs — `purgeNotificationFeed` below is the other.
 *
 * Holds no EVE token and makes no ESI call: every row already carries
 * rendered title/body text, uploaded by a device that read the real data
 * (ADR 0010). This function only decides *when* to fire what it was handed,
 * and pushes each row only to the device that uploaded it (issue #2240) —
 * see projectionStore.ts.
 */
export const dispatchProjections = onSchedule('every 15 minutes', async () => {
  await dispatchDueProjections(firestore(), getMessaging(), Date.now(), logError);
});

/**
 * pollEveNotifications (issue #3756, ADR 0020): every 15 minutes, reads each
 * active Alerts Grant's `/notifications/` feed and pushes the types a
 * registered device enabled. The only function that holds an EVE token, and
 * only the notifications-only one. Deploy is manual:
 * `firebase deploy --only functions:pollEveNotifications`.
 */
export const pollEveNotifications = onSchedule(
  {
    schedule: 'every 15 minutes',
    secrets: [ALERTS_TOKEN_KEY],
    timeoutSeconds: 540,
    maxInstances: 1,
  },
  async () => {
    const messaging = getMessaging();
    const summary = await pollEveNotificationsRun({
      store: firestorePollerStore(firestore(), {
        key: () => parseAlertsKey(ALERTS_TOKEN_KEY.value()),
        refresh: (clientId, refreshToken) => refreshAtSso(clientId, refreshToken),
      }),
      fetchNotifications: (characterId, accessToken, etag) =>
        fetchEsiNotifications(characterId, accessToken, etag),
      send: async (token, message) => {
        await messaging.send({
          token,
          data: message.data,
          ...(message.collapseKey ? { webpush: { headers: { Topic: message.collapseKey } } } : {}),
        });
      },
      log: (message, data) => logWarn(message, data),
    });
    logInfo('pollEveNotifications finished', { ...summary });
  }
);

/**
 * purgeNotificationFeed: server-side expiry for the remote Notification Feed
 * (issue #595), on the same 30 days the client rule and the fired-projection
 * purge already use.
 *
 * #582 made `syncFeed` delete a remote row fired outside the window, which
 * bounds the collection for any account that still syncs. It cannot reach an
 * account whose devices were all uninstalled without the Characters being
 * removed: nothing signs in as that uid again, so nothing runs the rule. This
 * job does, and reaches pre-existing rows too — it is a *collection group*
 * query, so one pass covers every `characters/{uid}/notificationFeed` without
 * enumerating accounts.
 *
 * Daily rather than every 5 minutes: the retention is 30 days, so the tick
 * only has to be small against that. It needs the collection-group index on
 * `firedAt` in firestore.indexes.json — deploy indexes before this function,
 * or the query fails FAILED_PRECONDITION until the index finishes building.
 */
export const purgeNotificationFeed = onSchedule('every 24 hours', runPurgeNotificationFeed);

/**
 * purgeStaleAccounts: deletes the synced data of accounts with no successful
 * sync in 90 days (issue #2065). Retention is by inactivity, not by Character
 * removal, so it reaches accounts whose devices are all gone.
 *
 * Enumerates `characters/{uid}` with `listDocuments()` (which includes uids
 * that only have subcollections and no parent doc), then per uid: seeds the
 * heartbeat if absent, or, when stale, empties every subcollection in bounded
 * batches and finally deletes the parent doc. The run-wide pass cap leaves a
 * large backlog for the next tick; the parent doc survives until its
 * subcollections are empty, so a half-purged account stays stale.
 */
export const purgeStaleAccounts = onSchedule(
  { schedule: 'every 24 hours', secrets: [ALERTS_TOKEN_KEY] },
  () => runPurgeStaleAccounts({ alertGrantDeps, corpSyncDeps })
);

// Communities (issue #3596, ADR 0018). Every write that enforces a cap or
// deletes another doc goes through these callables (communitiesStore.ts); the
// client only writes a Member's own library chunks, directly, under the rules.

/** The signed-in Character behind a callable: uid `char:{id}` + ownerHash claim. */
function callerOf(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}): CallerCharacter {
  const uid = request.auth?.uid;
  const ownerHash = request.auth?.token.ownerHash;
  if (!uid || !uid.startsWith('char:') || typeof ownerHash !== 'string') {
    throw new HttpsError('unauthenticated', 'Sign in with a Character first');
  }
  return { uid, ownerHash };
}

const COMMUNITY_CALLABLE_OPTIONS = { maxInstances: 5 };

// One deployed function per group instead of one per callable (see callableRouter.ts). The
// per-name exports below stay until every client calls `communityCall`.
const communityActions = createActionGroup();
const communityCallable = (name: string, options: CallableOptions, handler: CallableHandler) =>
  onCall<unknown>(options, communityActions.register(name, handler));
export const communityCall = onCall<unknown>({ maxInstances: 10 }, communityActions.route);

export const createCommunityCallable = communityCallable(
  'createCommunityCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => createCommunity(firestore(), callerOf(request), parseCreateInput(request.data))
);

// Callable with no session on purpose: the invite page shows what the link is
// for before a visitor signs in. Returns three public facts, see previewCommunity.
export const previewCommunityCallable = communityCallable(
  'previewCommunityCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => previewCommunity(firestore(), parsePreviewInput(request.data).inviteCode)
);

export const joinCommunityCallable = communityCallable(
  'joinCommunityCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => joinCommunity(firestore(), callerOf(request), parseJoinInput(request.data))
);

export const setCommunityApprovalCallable = communityCallable(
  'setCommunityApprovalCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, requireApproval } = parseRequireApprovalInput(request.data);
    await setRequireApproval(firestore(), callerOf(request), communityId, requireApproval);
  }
);

export const decideCommunityJoinRequestCallable = communityCallable(
  'decideCommunityJoinRequestCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, memberUid, accept } = parseJoinRequestDecisionInput(request.data);
    await decideJoinRequest(firestore(), callerOf(request), communityId, memberUid, accept);
  }
);

export const leaveCommunityCallable = communityCallable(
  'leaveCommunityCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    await leaveCommunity(
      firestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    );
  }
);

export const removeCommunityMemberCallable = communityCallable(
  'removeCommunityMemberCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, memberUid } = parseRemoveMemberInput(request.data);
    await removeMember(firestore(), callerOf(request), communityId, memberUid);
  }
);

export const transferCommunityAdminCallable = communityCallable(
  'transferCommunityAdminCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, memberUid } = parseTransferAdminInput(request.data);
    await transferAdmin(firestore(), callerOf(request), communityId, memberUid);
  }
);

// Mail invites (issue #3604): the client sends the EVE mail with its own token,
// so the cap, the one-per-target rule and the "Sent" stamp live in these three.
export const reserveCommunityMailInviteCallable = communityCallable(
  'reserveCommunityMailInviteCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => {
    const { communityId, targetCharacterId, targetName } = parseMailInviteInput(request.data);
    return reserveMailInvite(
      firestore(),
      callerOf(request),
      communityId,
      targetCharacterId,
      targetName
    );
  }
);

export const confirmCommunityMailInviteCallable = communityCallable(
  'confirmCommunityMailInviteCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, targetCharacterId } = parseMailInviteInput(request.data);
    await confirmMailInvite(firestore(), callerOf(request), communityId, targetCharacterId);
  }
);

export const releaseCommunityMailInviteCallable = communityCallable(
  'releaseCommunityMailInviteCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, targetCharacterId } = parseMailInviteInput(request.data);
    await releaseMailInvite(firestore(), callerOf(request), communityId, targetCharacterId);
  }
);

export const revokeCommunityInviteCallable = communityCallable(
  'revokeCommunityInviteCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    await revokeInvite(
      firestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    );
  }
);

export const regenerateCommunityInviteCallable = communityCallable(
  'regenerateCommunityInviteCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) =>
    regenerateInvite(
      firestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    )
);

export const deleteCommunityCallable = communityCallable(
  'deleteCommunityCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    await deleteCommunity(
      firestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    );
  }
);

// Community Requests (issue #3807, ADR 0021): posting counts the caller's open
// Requests, so it is a callable; extend and close/reopen are the requester's own.
export const postCommunityRequestCallable = communityCallable(
  'postCommunityRequestCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => postRequest(firestore(), callerOf(request), parsePostRequestInput(request.data))
);

export const editCommunityRequestCallable = communityCallable(
  'editCommunityRequestCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => editRequest(firestore(), callerOf(request), parseEditRequestInput(request.data))
);

export const extendCommunityRequestCallable = communityCallable(
  'extendCommunityRequestCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => {
    const { communityId, requestId } = parseRequestIdInput(request.data);
    return extendRequest(firestore(), callerOf(request), communityId, requestId);
  }
);

export const setCommunityRequestClosedCallable = communityCallable(
  'setCommunityRequestClosedCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, requestId, closed } = parseSetClosedInput(request.data);
    await setRequestClosed(firestore(), callerOf(request), communityId, requestId, closed);
  }
);

// Pledge mail: the Pledger's client sends the EVE mail with its own token; the
// 100-a-day cap and the once-per-Pledger-per-Request rule live in these three.
// The recipient is the Request's owner, read server-side, never sent by a client.
export const reserveCommunityPledgeMailCallable = communityCallable(
  'reserveCommunityPledgeMailCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => {
    const { communityId, requestId } = parseRequestIdInput(request.data);
    return reservePledgeMail(firestore(), callerOf(request), communityId, requestId);
  }
);

export const confirmCommunityPledgeMailCallable = communityCallable(
  'confirmCommunityPledgeMailCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, requestId } = parseRequestIdInput(request.data);
    await confirmPledgeMail(firestore(), callerOf(request), communityId, requestId);
  }
);

export const releaseCommunityPledgeMailCallable = communityCallable(
  'releaseCommunityPledgeMailCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, requestId } = parseRequestIdInput(request.data);
    await releasePledgeMail(firestore(), callerOf(request), communityId, requestId);
  }
);

// The admin removes any Request or Pledge (issue #3812): no per-Community
// switch, so the callables only check the caller is the Community's admin.
export const removeCommunityRequestCallable = communityCallable(
  'removeCommunityRequestCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, requestId } = parseRequestIdInput(request.data);
    await removeRequest(firestore(), callerOf(request), communityId, requestId);
  }
);

export const removeCommunityPledgeCallable = communityCallable(
  'removeCommunityPledgeCallable',
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, requestId, pledgeUid } = parseRemovePledgeInput(request.data);
    await removePledge(firestore(), callerOf(request), communityId, requestId, pledgeUid);
  }
);

// Corp Tax Book (issue #4061, ADR 0023). Every write to a corporation's book
// goes through these callables (corpTaxBookStore.ts) and lands in its audit
// log; the client only reads, under firestore.rules. The caller sends a
// short-lived EVE access token for the role check; it is used for ESI reads
// and dropped, never stored or logged.
const corpTaxBookDeps = (): BookDeps => ({
  db: firestore(),
  now: Date.now,
  verifyToken: (token) => verifyEveAccessToken(token, verifyOptions),
  readIdentity: esiIdentityReader(),
});

const CORP_TAX_BOOK_OPTIONS = { maxInstances: 5 };

const corpTaxBookActions = createActionGroup();
const corpTaxBookCallable = (name: string, options: CallableOptions, handler: CallableHandler) =>
  onCall<unknown>(options, corpTaxBookActions.register(name, handler));

// Collector books (issue #4507): invite links for a feeder corporation. Codes only; the UI maps them later.
export const createCorpTaxBookFeederInviteCallable = corpTaxBookCallable(
  'createCorpTaxBookFeederInviteCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) =>
    createFeederInvite(
      corpTaxBookDeps(),
      callerOf(request),
      parseCreateFeederInviteInput(request.data)
    )
);

export const revokeCorpTaxBookFeederInviteCallable = corpTaxBookCallable(
  'revokeCorpTaxBookFeederInviteCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) =>
    revokeFeederInvite(
      corpTaxBookDeps(),
      callerOf(request),
      parseRevokeFeederInviteInput(request.data)
    )
);

// The consent screen's preview of a link: the accounting corporation and the offered rate.
export const previewCorpTaxBookFeederInviteCallable = corpTaxBookCallable(
  'previewCorpTaxBookFeederInviteCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) =>
    previewFeederInvite(
      corpTaxBookDeps(),
      callerOf(request),
      parsePreviewFeederInviteInput(request.data)
    )
);

export const acceptCorpTaxBookFeederInviteCallable = corpTaxBookCallable(
  'acceptCorpTaxBookFeederInviteCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) =>
    acceptFeederInvite(
      corpTaxBookDeps(),
      callerOf(request),
      parseAcceptFeederInviteInput(request.data)
    )
);

// Scheduled Corp Tax Book sync (issue #4068, ADR 0025). The second server-held EVE
// token: an opt-in, narrow-scope grant per corporation, encrypted under the same
// `ALERTS_TOKEN_KEY` secret (bound to its own purpose, so blobs do not cross
// collections). Nothing here logs or returns a token; firestore.rules denies the
// grant collection.
function corpSyncDeps(): CorpSyncDeps {
  return {
    db: firestore(),
    now: Date.now,
    esi: esiSyncReader(),
    key: () => parseAlertsKey(ALERTS_TOKEN_KEY.value()),
    verify: (accessToken) => verifyEveAccessToken(accessToken, verifyOptions),
    refresh: (clientId, refreshToken) => refreshAtSso(clientId, refreshToken),
    revoke: (clientId, refreshToken) => revokeAtSso(clientId, refreshToken),
    readIdentity: esiIdentityReader(),
    openPrices: r2OpenPrices,
    log: (message, data) => logWarn(message, data),
  };
}

// The moon owner's view values ore at the book hub's daily open price in R2 (issue #4512).
// Lazy, so a function without the R2 secrets only fails when it rebuilds a view.
function r2OpenPrices(typeId: number): Promise<unknown | null> {
  return createR2Get(r2ConfigOrThrow())(openPricesR2Key(typeId));
}
const FEEDER_VIEW_SECRETS = [ALERTS_TOKEN_KEY, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY];

// Proven by the signed-in Character AND the grant's own access token, which must be
// for that same Character; the corporation and its roles are read with the grant.
export const saveCorpTaxBookSyncGrantCallable = corpTaxBookCallable(
  'saveCorpTaxBookSyncGrantCallable',
  { maxInstances: 5, secrets: [ALERTS_TOKEN_KEY] },
  (request) =>
    saveCorpSyncGrant(corpSyncDeps(), callerOf(request), parseSaveCorpSyncGrantInput(request.data))
);

// Collector books (issue #4511): the moon owner's side. The grant is a separate SSO login by
// the Accountant alt (mining scope only); the first ledger pull is the role check.
export const saveCorpTaxBookFeederGrantCallable = corpTaxBookCallable(
  'saveCorpTaxBookFeederGrantCallable',
  { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS },
  (request) =>
    saveFeederGrant(
      { ...corpSyncDeps(), esi: esiSyncReader(), lookupCorporation: esiCorporationLookup() },
      callerOf(request),
      parseSaveFeederGrantInput(request.data)
    )
);

export const leaveCorpTaxBookFeederCallable = corpTaxBookCallable(
  'leaveCorpTaxBookFeederCallable',
  { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS },
  (request) => leaveFeeder(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

export const getCorpTaxBookFeederStatusCallable = corpTaxBookCallable(
  'getCorpTaxBookFeederStatusCallable',
  { maxInstances: 5, secrets: [ALERTS_TOKEN_KEY] },
  (request) => getFeederStatus(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

// The moon owner's view (issue #4512): its officers (CEO, Director, Accountant; live role check)
// get a 24h access record the rules read, may ask for a rate, and dismiss the after-leaving view.
export const getCorpTaxBookFeederViewAccessCallable = corpTaxBookCallable(
  'getCorpTaxBookFeederViewAccessCallable',
  { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS },
  (request) => getFeederViewAccess(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

export const requestCorpTaxBookFeederRateCallable = corpTaxBookCallable(
  'requestCorpTaxBookFeederRateCallable',
  { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS },
  (request) =>
    requestFeederRate(corpSyncDeps(), callerOf(request), parseRequestFeederRateInput(request.data))
);

// The moon owner names its payee: its own CEO, Directors and Accountants. The accounting
// corporation's officers set it too (#4653), through `setCorpTaxBookFeederPayeeFromBookCallable`.
export const setCorpTaxBookFeederPayeeCallable = corpTaxBookCallable(
  'setCorpTaxBookFeederPayeeCallable',
  { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS },
  (request) =>
    setFeederPayee(
      corpSyncDeps(),
      callerOf(request),
      parseSetFeederPayeeInput(request.data),
      esiIdCategoryLookup()
    )
);

export const dismissCorpTaxBookFeederHistoryCallable = corpTaxBookCallable(
  'dismissCorpTaxBookFeederHistoryCallable',
  { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS },
  (request) =>
    dismissFeederHistory(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

// The accounting corporation's side of a moon owner (issue #4586): officers agree a rate, settle
// otherwise and list open invite links. The view rebuild prices ore from R2, so these carry its secrets.
const feederOwnerDeps = (): BookDeps => ({ ...corpTaxBookDeps(), openPrices: r2OpenPrices });
const FEEDER_OWNER_OPTIONS = { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS };

export const setCorpTaxBookFeederRateCallable = corpTaxBookCallable(
  'setCorpTaxBookFeederRateCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    setFeederRate(feederOwnerDeps(), callerOf(request), parseSetFeederRateInput(request.data))
);

export const setCorpTaxBookFeederModeCallable = corpTaxBookCallable(
  'setCorpTaxBookFeederModeCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    setFeederMode(feederOwnerDeps(), callerOf(request), parseSetFeederModeInput(request.data))
);

// Refinery labels (issue #4640): the accounting side passes `feederCorporationId`; the moon owner's
// own officers do not.
export const setCorpTaxBookRefineryLabelCallable = corpTaxBookCallable(
  'setCorpTaxBookRefineryLabelCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    setRefineryLabel(feederOwnerDeps(), callerOf(request), parseSetRefineryLabelInput(request.data))
);

export const setCorpTaxBookOwnRefineryLabelCallable = corpTaxBookCallable(
  'setCorpTaxBookOwnRefineryLabelCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    setOwnRefineryLabel(
      corpSyncDeps(),
      callerOf(request),
      parseSetOwnRefineryLabelInput(request.data)
    )
);

// A refinery's system (issue #4650): a miner's client reports what its own ledger placed it in.
export const learnCorpTaxBookRefinerySystemsCallable = corpTaxBookCallable(
  'learnCorpTaxBookRefinerySystemsCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) =>
    learnRefinerySystems(
      corpTaxBookDeps(),
      callerOf(request),
      parseLearnRefinerySystemsInput(request.data)
    )
);

// Removing a moon owner (issue #4520): start, notice sent, cancel (officers), the payee's link.
const removalDeps = (): BookDeps => ({
  ...feederOwnerDeps(),
  corporationCeo: esiCorporationCeoLookup(),
});

// Either side sets a moon owner's payee (#4653): this is the accounting corporation's officers'
// side (Accountant or higher, live role check). The CEO lookup names whom the change is mailed to.
export const setCorpTaxBookFeederPayeeFromBookCallable = corpTaxBookCallable(
  'setCorpTaxBookFeederPayeeFromBookCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    setBookFeederPayee(
      removalDeps(),
      callerOf(request),
      parseSetBookFeederPayeeInput(request.data),
      esiIdCategoryLookup()
    )
);

export const startCorpTaxBookFeederRemovalCallable = corpTaxBookCallable(
  'startCorpTaxBookFeederRemovalCallable',
  FEEDER_OWNER_OPTIONS,
  (request) => startFeederRemoval(removalDeps(), callerOf(request), parseRemovalCall(request.data))
);

export const recordCorpTaxBookFeederRemovalSentCallable = corpTaxBookCallable(
  'recordCorpTaxBookFeederRemovalSentCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    recordRemovalSent(removalDeps(), callerOf(request), parseRemovalNoticeCall(request.data))
);

export const cancelCorpTaxBookFeederRemovalCallable = corpTaxBookCallable(
  'cancelCorpTaxBookFeederRemovalCallable',
  FEEDER_OWNER_OPTIONS,
  (request) => cancelFeederRemoval(removalDeps(), callerOf(request), parseRemovalCall(request.data))
);

export const getCorpTaxBookRemovalLinkCallable = corpTaxBookCallable(
  'getCorpTaxBookRemovalLinkCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => getRemovalLink(removalDeps(), callerOf(request), parseRemovalLinkCall(request.data))
);

export const forceCorpTaxBookRemovalCallable = corpTaxBookCallable(
  'forceCorpTaxBookRemovalCallable',
  { maxInstances: 5, secrets: FEEDER_VIEW_SECRETS },
  (request) =>
    forceRemovalNow(
      corpSyncDeps(),
      callerOf(request),
      parseRemovalLinkCall(request.data),
      esiCorporationCeoLookup()
    )
);

/** Ends every removal whose 24 hours are up. Deploy is manual, like the other schedules. */
export const finalizeCorpTaxBookRemovals = onSchedule(
  { schedule: 'every 1 hours', secrets: FEEDER_VIEW_SECRETS, maxInstances: 1 },
  async () => {
    const summary = await finalizeDueRemovals(corpSyncDeps());
    logInfo('finalizeCorpTaxBookRemovals finished', { ...summary });
  }
);

// Paying a moon owner (issue #4514): record a payout, mark a journal row not a payout, and attach
// the wallet journal's outgoing donations to the records. Each rebuilds the moon owner's view.
export const recordCorpTaxBookFeederPayoutCallable = corpTaxBookCallable(
  'recordCorpTaxBookFeederPayoutCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    recordFeederPayout(feederOwnerDeps(), callerOf(request), parseRecordPayoutInput(request.data))
);

export const markCorpTaxBookFeederPayoutCallable = corpTaxBookCallable(
  'markCorpTaxBookFeederPayoutCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    markFeederPayout(feederOwnerDeps(), callerOf(request), parseMarkPayoutInput(request.data))
);

export const reconcileCorpTaxBookFeederPayoutsCallable = corpTaxBookCallable(
  'reconcileCorpTaxBookFeederPayoutsCallable',
  FEEDER_OWNER_OPTIONS,
  (request) =>
    reconcileFeederPayoutsCall(
      { ...feederOwnerDeps(), esi: esiSyncReader() },
      callerOf(request),
      parseReconcilePayoutsInput(request.data)
    )
);

export const listCorpTaxBookFeederInvitesCallable = corpTaxBookCallable(
  'listCorpTaxBookFeederInvitesCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => listFeederInvites(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data))
);

// The holder revokes their own; the CEO revokes anyone's (live role check, so it carries an access token).
export const revokeCorpTaxBookSyncGrantCallable = corpTaxBookCallable(
  'revokeCorpTaxBookSyncGrantCallable',
  { maxInstances: 5, secrets: [ALERTS_TOKEN_KEY] },
  (request) => revokeCorpSyncGrant(corpSyncDeps(), callerOf(request), parseBookCall(request.data))
);

/**
 * syncCorpTaxBooks (issue #4068, ADR 0025): every 6 hours, syncs and settles each
 * opted-in corporation's Corp Tax Book with its grant holder's token. Never issues
 * a Statement or sends mail. Deploy is manual:
 * `firebase deploy --only functions:syncCorpTaxBooks`.
 */
export const syncCorpTaxBooks = onSchedule(
  {
    schedule: 'every 6 hours',
    secrets: FEEDER_VIEW_SECRETS,
    timeoutSeconds: 540,
    maxInstances: 1,
  },
  async () => {
    const summary = await runScheduledCorpSyncs(corpSyncDeps(), esiSyncReader());
    logInfo('syncCorpTaxBooks finished', { ...summary });
  }
);

export const verifyCorpOfficerCallable = corpTaxBookCallable(
  'verifyCorpOfficerCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => verifyOfficer(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data))
);

export const turnOnCorpTaxBookCallable = corpTaxBookCallable(
  'turnOnCorpTaxBookCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => turnOnBook(corpTaxBookDeps(), callerOf(request), parseTurnOnInput(request.data))
);

// Whoever turned the book on (or the CEO) deletes it; the scheduled-sync grant is revoked with it.
export const deleteCorpTaxBookCallable = corpTaxBookCallable(
  'deleteCorpTaxBookCallable',
  { ...CORP_TAX_BOOK_OPTIONS, secrets: [ALERTS_TOKEN_KEY] },
  (request) =>
    deleteBook(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data), (corporationId) =>
      dropBookGrants(corpSyncDeps(), corporationId)
    )
);

export const reclaimCorpTaxBookCallable = corpTaxBookCallable(
  'reclaimCorpTaxBookCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => reclaimBook(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data))
);

// A sync is many small transactions (up to 2000 observer rows), so give it room.
export const syncCorpTaxBookCallable = corpTaxBookCallable(
  'syncCorpTaxBookCallable',
  { ...CORP_TAX_BOOK_OPTIONS, timeoutSeconds: 120 },
  (request) =>
    syncBook(corpTaxBookDeps(), callerOf(request), parseSyncInput(request.data, Date.now()))
);

export const editCorpTaxBookCallable = corpTaxBookCallable(
  'editCorpTaxBookCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) =>
    editBook(
      corpTaxBookDeps(),
      callerOf(request),
      parseBookCall(request.data),
      parseEditAction(request.data)
    )
);

// A player claims their own Unmatched donation (D5): uid-authorised, no officer role.
export const claimCorpTaxBookPaymentCallable = corpTaxBookCallable(
  'claimCorpTaxBookPaymentCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => {
    const { corporationId, paymentId } = parseClaimPaymentInput(request.data);
    return claimPayment(corpTaxBookDeps(), callerOf(request), corporationId, paymentId);
  }
);

export const confirmCorpTaxBookGroupingCallable = corpTaxBookCallable(
  'confirmCorpTaxBookGroupingCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => {
    const { corporationId, minerId } = parseConfirmGroupingInput(request.data);
    return confirmGrouping(corpTaxBookDeps(), callerOf(request), corporationId, minerId);
  }
);

export const declineCorpTaxBookGroupingCallable = corpTaxBookCallable(
  'declineCorpTaxBookGroupingCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => {
    const { corporationId, minerId } = parseConfirmGroupingInput(request.data);
    return declineGrouping(corpTaxBookDeps(), callerOf(request), corporationId, minerId);
  }
);

export const listPendingCorpTaxBookGroupingsCallable = corpTaxBookCallable(
  'listPendingCorpTaxBookGroupingsCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => listPendingGroupings(corpTaxBookDeps(), callerOf(request))
);

// No session on purpose: the verify link is the credential (D27), so a miner
// without an EVE login can read their Statement and stop reminders.
export const readCorpTaxBookStatementCallable = corpTaxBookCallable(
  'readCorpTaxBookStatementCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => readStatementByToken(corpTaxBookDeps(), parseToken(request.data))
);

// A decline needs only the link; a confirm never does (it needs the character's own sign-in).
export const declineCorpTaxBookGroupingByTokenCallable = corpTaxBookCallable(
  'declineCorpTaxBookGroupingByTokenCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => {
    const { token, characterId } = parseDeclineByTokenInput(request.data);
    return declineGroupingByToken(corpTaxBookDeps(), token, characterId);
  }
);

export const stopCorpTaxBookRemindersCallable = corpTaxBookCallable(
  'stopCorpTaxBookRemindersCallable',
  CORP_TAX_BOOK_OPTIONS,
  (request) => {
    const { token, stopped } = parseStopReminders(request.data);
    return setRemindersByToken(corpTaxBookDeps(), token, stopped);
  }
);

// The Corp Tax Book router: the union of its callables' secrets and the longest timeout (a sync is many
// small transactions). Clients call this; the per-name exports above go once none do.
export const corpTaxBookCall = onCall<unknown>(
  { maxInstances: 10, secrets: FEEDER_VIEW_SECRETS, timeoutSeconds: 120 },
  corpTaxBookActions.route
);

/**
 * sweepCommunityRequests (issue #3812, ADR 0021): deletes Requests expired a
 * week ago and Requests closed a week ago, with their Pledges. Bounded to 500
 * deletes a run; a backlog continues on the next tick. Up to 500 sequential
 * read and recursive deletes, so it takes the 9-minute maximum timeout.
 */
export const sweepCommunityRequests = onSchedule(
  { schedule: 'every 24 hours', timeoutSeconds: 540 },
  async () => {
    const result = await sweepRequests(firestore(), Date.now());
    const { deleted, failed, truncated } = result;
    if (failed > 0 || truncated) {
      logWarn('Community Request sweep incomplete, continues next run', {
        deleted,
        failed,
        truncated,
      });
    } else {
      logInfo('Community Request sweep done', { deleted, failed, truncated });
    }
  }
);

/**
 * syncLawlessSystems (issue #2870): Route Safety's "lawless" badge. CCP's
 * insurgency feed is CORS-locked to eveonline.com, so this fetches it every
 * 15 minutes (CCP caches it for 10; cost: it was every 10) and stores the
 * lawless system ids for the app to read. A failed fetch writes nothing: the doc just ages, and the app
 * hides the badge once `updatedAt` passes its staleness limit. An unchanged
 * list is not rewritten each run (issue #4272): only when it changes or the
 * `LAWLESS_HEARTBEAT_MS` refresh is due, so `updatedAt` means "last confirmed".
 *
 * Another Cloud Scheduler job past the free three, like the jobs above.
 */
export const syncLawlessSystems = onSchedule(
  { schedule: 'every 15 minutes' },
  runSyncLawlessSystems
);

/**
 * syncActiveWars: the War banner's data (`systemConditions/activeWars`). ESI
 * cannot list one corporation's wars, so this keeps every war that is still
 * running and the app picks its own out of the list. Twice a day: a new
 * declaration also reaches a pilot sooner through their Alerts, and a war has
 * a 24-hour wait before it starts, so 12 hours is a fine cadence for the
 * pilot who had no alerts on.
 *
 * Each run reads new war ids, re-reads the wars it holds, and spends the rest
 * of its allowance seeding backward from the newest id (`activeWars.ts`), so the
 * first runs fill in about a year of history. ESI gives `/wars/{id}` 3,600
 * tokens per 15 minutes; a run stops short of emptying that window. It can be
 * run again by hand from Cloud Scheduler to seed faster.
 *
 * Another Cloud Scheduler job past the free three, like the jobs above.
 */
export const syncActiveWars = onSchedule(
  { schedule: 'every 12 hours', timeoutSeconds: 540, maxInstances: 1 },
  runSyncActiveWars
);

/**
 * syncPublicContractOffers: the public contract search's data source
 * (issues #608, #906, ADR 0013). Pulls EVE Ref's public-contracts snapshot
 * (no CORS, so the client can't fetch it directly) and republishes every
 * for-sale line of every public item_exchange/auction contract, any item
 * type, to Cloudflare R2 (`contract-offers/`) for clients to search. R2 is the
 * only store (ADR 0019; issue #4270 removed the Firestore copies).
 *
 * Every 30 minutes, matching EVE Ref's own twice-hourly refresh cadence.
 *
 * The archive is streamed rather than buffered: `contracts.csv` is read into
 * a lookup of only the fields the join needs, then `contract_items.csv` is
 * joined against it row by row. Holding the two CSVs as text and parsing them
 * whole needed ~1.1GB of heap for 37MB of input; the streaming pass peaks far
 * below that against the same live data.
 *
 * It publishes a second snapshot off the same pass: the courier snapshot,
 * every outstanding public courier contract as a route and a fee (issue #909).
 * Courier contracts have no item lines to join, so they cost one more
 * accumulator and ~2 more R2 puts per run — deliberately not a second scheduled
 * function or a second archive fetch, which is the shape #907 spent a ticket
 * undoing.
 *
 * This is the only public-contract sync. #906 added it beside a
 * blueprint-copies-only one as the expand half of an expand/contract, and
 * #907 retired that one once BPC Sourcing learned to take its blueprint slice
 * out of this snapshot client-side — so the archive is fetched once per cycle
 * again rather than twice.
 *
 * Memory is 2GiB against the retired blueprint-only sync's 1GiB, and the
 * timeout 540s against its 300s. Neither is measured at this volume; both are provisioned for
 * ~3x the rows on the evidence that exists. That evidence is specific: a
 * 512MiB ceiling died at 527MiB *during the (then Firestore) write* with ~122k rows, having
 * survived the streaming parse — so the ceiling scales with the retained rows
 * and their encoding, which is exactly what triples here. Under-provisioning
 * reproduces a failure this project has already had (every scheduled run
 * OOM-looping silently after deploy); over-provisioning costs pennies on a
 * 48-runs/day cron. The `rowCount` logged below is the checkpoint: the first
 * live runs say what the real volume is, and these numbers can come down.
 *
 * 540s is the gen2 ceiling, not a chosen value, so there is no knob left if
 * the ~3x estimate is badly low: a run that can't finish inside it needs the
 * write restructured (incremental chunk commits, or the join split by region)
 * rather than a config bump. `rowCount` is the early warning for that too.
 *
 * It is the third of the deployment's Cloud Scheduler jobs, alongside
 * `dispatchProjections` and `purgeNotificationFeed` — back inside the 3 free
 * per billing account ADR 0013 budgeted against, now that the blueprint-only
 * sync it briefly ran beside is gone.
 */
export const syncPublicContractOffers = onSchedule(
  {
    schedule: 'every 30 minutes',
    memory: '2GiB',
    timeoutSeconds: 540,
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY],
  },
  runSyncPublicContractOffers
);

/**
 * syncWorkbenchFits: EVE Workbench's public fits, grouped by hull into one R2
 * object per hull (`workbench-fits/<shipTypeId>.json`, issue #4271) for the
 * Popular fit panel's EVE Workbench tab (issue #2484). Workbench's list
 * can't be filtered by hull, so this keeps our own copy — see
 * workbenchFits.ts for the pass/checkpoint design, and the decision doc it
 * ships with.
 *
 * Every 12 hours (cost: it was every 30 minutes), each run fetching for at
 * most `WORKBENCH_FETCH_BUDGET_MS` then flushing to R2 (only hulls whose fits
 * changed). Requests are sequential with a 250ms gap (≤ 4/s
 * against a free, unauthenticated API), so a run stores roughly 1,000 fits:
 * the first pass over ~38k fits takes ~40 runs, about 20 days at this cadence, after which a run
 * is one list page plus however many fits were published since.
 *
 * The 360s budget leaves 180s of the 540s timeout for the flush, which reads
 * and rewrites every hull the run touched (a few hundred during the first
 * pass). A flush that overran the timeout would never save the checkpoint, so
 * every later run would redo the same pages — this margin is what prevents it.
 *
 * 1GiB because a run reads back every hull it touches whole (then merges and
 * gzips it), and the most-fitted hulls are a few MB of EFT each. The one-time
 * migration run streams the legacy docs 20 at a time, so it holds at most a
 * page plus the hulls being written.
 *
 * Another Cloud Scheduler job past the free three — the same trade
 * `captureMiningPriceSnapshot` already made.
 */

export const syncWorkbenchFits = onSchedule(
  {
    schedule: 'every 12 hours',
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY],
  },
  runSyncWorkbenchFits
);

/**
 * syncLpStoreOffers: the LP Store page's item-first search (issue #2873). Reads
 * every LP corporation's public offers from ESI (~170 requests, paced) and
 * republishes them with each corporation's station systems to R2
 * (`lp-store-offers/snapshot.json`), so the app can search an item across all
 * stores and rank corporations by jumps. R2, not Firestore: the whole snapshot is
 * read by every visitor to the page, and R2 has no egress fee.
 * Needs the R2 secrets and env like `syncPublicContractOffers`.
 *
 * Once a day: store offers change on patch days, not by the hour. A run that
 * lost more than a tenth of the corporations (ESI down) publishes nothing and
 * leaves yesterday's snapshot standing, since the write replaces it wholesale.
 *
 * Another Cloud Scheduler job past the free three, the same trade as
 * `syncWorkbenchFits`; the deployment now has eight scheduled functions.
 */

export const syncLpStoreOffers = onSchedule(
  {
    schedule: 'every 24 hours',
    memory: '512MiB',
    timeoutSeconds: 540,
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY],
  },
  runSyncLpStoreOffers
);

/**
 * syncMarketOpenPrices: the price-history chart's Buy and Sell lines (decision
 * 20261018-121126). Once a day, shortly after the previous UTC day's last
 * EVE Ref market-order snapshot (23:45) is published, folds that snapshot into
 * the highest buy and lowest sell per hub *station* and type (only orders
 * placed at the station; decision 20261019-004148 moved it from region-wide) and
 * merges the day into R2's `open-prices/<typeId>.json`, every hub station in
 * one object (~20,000 objects; layout decision 20261018-164126, storage
 * decision 20261018-201511-moving-the-daily-snapshots-to-r2). The region-wide
 * fold still runs in the same pass, but only for the plausibility guards; it is
 * no longer stored. Only the small meta doc stays in Firestore, for the shrink
 * guard. The mining pages price from these same objects (decision
 * 20261019-091155, which retired the separate `mining-prices/` month objects).
 *
 * Idempotent (re-running a day replaces its entry). The day's 23:45 snapshot is
 * normally listed by ~23:50, but a run that finds only an earlier one (EVE Ref
 * lagging) or none must not store a price that is not the day's last, so it
 * throws and Cloud Scheduler retries it (`retryCount`, 15 then 30 minutes
 * apart); an earlier snapshot is accepted once the next day is listed, since
 * then the 23:45 slot was skipped for good (`findFinalSnapshot`). A stream that
 * errors or ends truncated also throws and retries. A tracked region
 * implausibly thin, or one under half its size on the previous published day,
 * publishes nothing, the same stance as `syncLpStoreOffers`: retrying the same
 * file would not change it, that day simply has no point, and the backfill
 * script can fill it later. 1GiB because the decompress-and-fold peaked at ~300MB RSS
 * in a local measurement and the contracts job has OOM'd before; 540s because
 * the same measurement took ~45s to download and fold, leaving room for the
 * ~20,000 read-merge-write round trips of ~37 KB objects (32 at a time). Folding
 * every type per station (#4279) adds one map lookup per row and holds ~5 x 15k
 * station/type pairs, the size of the region fold; it writes no more objects
 * than the region fold did (a type priced only away from the hub stations gets
 * no new day), so the same 540s holds. A
 * type that fails to read or write throws the run, so it is retried whole; the
 * merge is idempotent.
 *
 * Another Cloud Scheduler job past the free three; with `captureMiningPriceSnapshot`
 * folded in here the deployment has ten scheduled functions.
 */
export const syncMarketOpenPrices = onSchedule(
  // A cron, unlike the other jobs' 'every N' strings, runs in the scheduler's
  // default zone; pinning Etc/UTC keeps it right after the 23:45 UTC snapshot.
  {
    schedule: '45 0 * * *',
    timeZone: 'Etc/UTC',
    memory: '1GiB',
    timeoutSeconds: 540,
    // A thrown run (the final snapshot not listed yet, a broken download) is
    // retried at ~01:00, ~01:30 and ~02:00 UTC; `previousUtcDate` still names
    // the same day on every retry.
    retryCount: 3,
    minBackoffSeconds: 900,
    maxBackoffSeconds: 1800,
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY],
  },
  runSyncMarketOpenPrices
);

// mutamarketEstimate (mutamarket.ts). Session required: an import publishes
// the module on MutaMarket. `maxInstances: 1` keeps the proxy's cache and
// import queue global.
const mutamarket = new MutamarketProxy();

export const mutamarketEstimate = onCall<unknown>(
  { maxInstances: 1, timeoutSeconds: 120 },
  async (request) => {
    callerOf(request);
    try {
      return await mutamarket.estimate(parseEstimateInput(request.data));
    } catch (err) {
      if (err instanceof MutamarketInputError) {
        throw new HttpsError('invalid-argument', err.message);
      }
      if (err instanceof MutamarketBusyError) {
        throw new HttpsError('resource-exhausted', 'MutaMarket import queue is full');
      }
      if (err instanceof MutamarketUnavailableError) {
        logWarn('MutaMarket unavailable', { error: err.message });
        throw new HttpsError('unavailable', 'MutaMarket is unavailable');
      }
      throw err;
    }
  }
);
