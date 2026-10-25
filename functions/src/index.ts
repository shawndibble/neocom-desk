// mintFirebaseToken: exchange a verified EVE access token for a Firebase
// custom token. The EVE *refresh* token never reaches this backend (ADR 0001);
// the client sends only its short-lived access token, which is verified
// against EVE's published JWKS before any Firebase credential is minted.

import { callerFromAuth, signedInCharacter, verifyAccessToken, type Caller } from './actorAuth.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createActionGroup, type CallableHandler } from './callableRouter.js';
import type { CallableAction } from './callableManifest.js';
import { runDailyHousekeeping } from './dailyHousekeeping.js';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { error as logError, info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { firestore } from './firestore.js';
import {
  installBookWriteTracking,
  stampBook,
  withBookVersions,
} from './corpTaxBookVersionTracking.js';
import { runPurgeNotificationFeed, runPurgeStaleAccounts } from './purgeJobs.js';
import { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, r2ConfigOrThrow } from './r2Publish.js';
import { openPricesR2Key } from './r2DailySnapshots.js';
import { createR2Get } from './r2Publisher.js';
import { runSyncActiveWars } from './activeWarsJob.js';
import { runSyncLawlessSystems } from './marketHistoryJob.js';
import { runSyncPublicContractOffers, runSyncWorkbenchFits } from './snapshotJobs.js';
import { verifyEveAccessToken, verifyOptionsFromEnv, uidForCharacter } from './verifyEveToken.js';
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
import {
  dispatchDueProjections,
  purgeFiredProjections,
  writeDeviceRegistration,
} from './projectionStore.js';
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
import { parseSrpSettingsPatch } from './srp.js';
import { deleteSrpDoctrine, previewSrpDoctrineCheck, saveSrpDoctrine } from './srpDoctrineStore.js';
import { parseDeleteDoctrine, parseSaveDoctrine } from './srpDoctrineInput.js';
import { parseFileClaimInput } from './srpKillmail.js';
import { srpKillmailSource } from './srpKillmailEsi.js';
import {
  fileSrpClaim,
  getSrpStatus,
  reclaimSrp,
  saveSrpSettings,
  turnOffSrp,
  turnOnSrp,
  verifySrpOfficer,
  type SrpDeps,
  type SrpFileDeps,
} from './srpStore.js';
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
  parseCreateFleetPayoutInput,
  parseFleetPayoutIdInput,
  parseSetFleetShareDoneInput,
} from './communityFleetPayouts.js';
import {
  createFleetPayout,
  removeFleetPayout,
  setFleetShareDone,
} from './communityFleetPayoutsStore.js';
import { sweepFleetPayouts } from './communityFleetPayoutsCleanup.js';
import { sweepSrpClaims } from './srpCleanup.js';
import {
  parseApproveBatch,
  parseApproveItem,
  parseChangeAmount,
  parseMarkPaidBatch,
  parseMarkPaidItem,
  parseReject,
} from './srpOfficer.js';
import {
  approveSrpClaim,
  approveSrpClaims,
  changeSrpClaimAmount,
  markSrpClaimPaid,
  markSrpClaimsPaid,
  rejectSrpClaim,
} from './srpOfficerStore.js';
import {
  MutamarketBusyError,
  MutamarketInputError,
  MutamarketProxy,
  MutamarketUnavailableError,
  parseEstimateInput,
} from './mutamarket.js';

initializeApp();
// Every write under `corps/{id}` restamps that book's version marker (issue #5047). Each
// entry point that can reach a book runs inside `bookVersioned`, which does the stamping.
installBookWriteTracking();
const bookVersioned = <T>(handler: () => T | Promise<T>): Promise<T> =>
  withBookVersions((id, touched) => stampBook(firestore(), id, touched), handler, logError);

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

    // Client response stays opaque (don't leak which validation step failed),
    // but the real cause still needs to be diagnosable from Cloud Logging.
    const claims = await verifyAccessToken(
      (token) => verifyEveAccessToken(token, verifyOptions),
      accessToken,
      {
        onReject: (err) =>
          logError('EVE access token rejected', {
            error: err instanceof Error ? err.message : err,
          }),
      }
    );

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
const alertsActions = createActionGroup();
const alertsAction = (name: CallableAction<'alerts'>, handler: CallableHandler): void => {
  alertsActions.register(name, handler);
};

alertsAction('registerDevice', async (request) => {
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
        logError('Device registration: seenTypes read failed', {
          characterId,
          error: String(err),
        });
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
alertsAction('saveAlertGrant', async (request) => {
  try {
    return await saveAlertGrantFor(alertGrantDeps(), parseSaveAlertGrantInput(request.data));
  } catch (err) {
    return alertGrantHttpsError(err);
  }
});

// Deleting needs the Character's own signed-in session, so one Character
// cannot drop another's grant.
alertsAction('deleteAlertGrant', async (request) => {
  const characterId = signedInCharacter(callerOf(request));
  try {
    return await deleteAlertGrantFor(alertGrantDeps(), characterId);
  } catch (err) {
    return alertGrantHttpsError(err);
  }
});

// The device and Alerts Grant router (see callableRouter.ts). Clients call this. The secret is only used by the grant actions.
export const alertsCall = onCall<unknown>(
  { maxInstances: 10, secrets: [ALERTS_TOKEN_KEY] },
  (request) => bookVersioned(() => alertsActions.route(request))
);

/**
 * dispatchProjections: fires whatever is due (issue #358, ADR 0010,
 * GLOSSARY.md round 45). Runs every 5 minutes, matching the Foreground
 * Poller's own cadence (`POLL_INTERVAL_MS`). One of this deployment's two
 * Cloud Scheduler jobs — `dailyHousekeeping` below is the other.
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

// Communities (issue #3596, ADR 0018). Every write that enforces a cap or
// deletes another doc goes through these callables (communitiesStore.ts); the
// client only writes a Member's own library chunks, directly, under the rules.

/** The signed-in Character behind a callable: uid `char:{id}` + ownerHash claim. */
function callerOf(request: { auth?: { uid: string; token: Record<string, unknown> } }): Caller {
  return callerFromAuth(request.auth);
}

// One deployed function per group instead of one per callable (see callableRouter.ts).
const communityActions = createActionGroup();
const communityAction = (name: CallableAction<'community'>, handler: CallableHandler): void => {
  communityActions.register(name, handler);
};
export const communityCall = onCall<unknown>({ maxInstances: 10 }, (request) =>
  bookVersioned(() => communityActions.route(request))
);

communityAction('createCommunityCallable', (request) =>
  createCommunity(firestore(), callerOf(request), parseCreateInput(request.data))
);

// Callable with no session on purpose: the invite page shows what the link is
// for before a visitor signs in. Returns three public facts, see previewCommunity.
communityAction('previewCommunityCallable', (request) =>
  previewCommunity(firestore(), parsePreviewInput(request.data).inviteCode)
);

communityAction('joinCommunityCallable', (request) =>
  joinCommunity(firestore(), callerOf(request), parseJoinInput(request.data))
);

communityAction('setCommunityApprovalCallable', async (request) => {
  const { communityId, requireApproval } = parseRequireApprovalInput(request.data);
  await setRequireApproval(firestore(), callerOf(request), communityId, requireApproval);
});

communityAction('decideCommunityJoinRequestCallable', async (request) => {
  const { communityId, memberUid, accept } = parseJoinRequestDecisionInput(request.data);
  await decideJoinRequest(firestore(), callerOf(request), communityId, memberUid, accept);
});

communityAction('leaveCommunityCallable', async (request) => {
  await leaveCommunity(
    firestore(),
    callerOf(request),
    parseCommunityIdInput(request.data).communityId
  );
});

communityAction('removeCommunityMemberCallable', async (request) => {
  const { communityId, memberUid } = parseRemoveMemberInput(request.data);
  await removeMember(firestore(), callerOf(request), communityId, memberUid);
});

communityAction('transferCommunityAdminCallable', async (request) => {
  const { communityId, memberUid } = parseTransferAdminInput(request.data);
  await transferAdmin(firestore(), callerOf(request), communityId, memberUid);
});

// Mail invites (issue #3604): the client sends the EVE mail with its own token,
// so the cap, the one-per-target rule and the "Sent" stamp live in these three.
communityAction('reserveCommunityMailInviteCallable', (request) => {
  const { communityId, targetCharacterId, targetName } = parseMailInviteInput(request.data);
  return reserveMailInvite(
    firestore(),
    callerOf(request),
    communityId,
    targetCharacterId,
    targetName
  );
});

communityAction('confirmCommunityMailInviteCallable', async (request) => {
  const { communityId, targetCharacterId } = parseMailInviteInput(request.data);
  await confirmMailInvite(firestore(), callerOf(request), communityId, targetCharacterId);
});

communityAction('releaseCommunityMailInviteCallable', async (request) => {
  const { communityId, targetCharacterId } = parseMailInviteInput(request.data);
  await releaseMailInvite(firestore(), callerOf(request), communityId, targetCharacterId);
});

communityAction('revokeCommunityInviteCallable', async (request) => {
  await revokeInvite(
    firestore(),
    callerOf(request),
    parseCommunityIdInput(request.data).communityId
  );
});

communityAction('regenerateCommunityInviteCallable', (request) =>
  regenerateInvite(firestore(), callerOf(request), parseCommunityIdInput(request.data).communityId)
);

communityAction('deleteCommunityCallable', async (request) => {
  await deleteCommunity(
    firestore(),
    callerOf(request),
    parseCommunityIdInput(request.data).communityId
  );
});

// Community Requests (issue #3807, ADR 0021): posting counts the caller's open
// Requests, so it is a callable; extend and close/reopen are the requester's own.
communityAction('postCommunityRequestCallable', (request) =>
  postRequest(firestore(), callerOf(request), parsePostRequestInput(request.data))
);

communityAction('editCommunityRequestCallable', (request) =>
  editRequest(firestore(), callerOf(request), parseEditRequestInput(request.data))
);

communityAction('extendCommunityRequestCallable', (request) => {
  const { communityId, requestId } = parseRequestIdInput(request.data);
  return extendRequest(firestore(), callerOf(request), communityId, requestId);
});

communityAction('setCommunityRequestClosedCallable', async (request) => {
  const { communityId, requestId, closed } = parseSetClosedInput(request.data);
  await setRequestClosed(firestore(), callerOf(request), communityId, requestId, closed);
});

// Pledge mail: the Pledger's client sends the EVE mail with its own token; the
// 100-a-day cap and the once-per-Pledger-per-Request rule live in these three.
// The recipient is the Request's owner, read server-side, never sent by a client.
communityAction('reserveCommunityPledgeMailCallable', (request) => {
  const { communityId, requestId } = parseRequestIdInput(request.data);
  return reservePledgeMail(firestore(), callerOf(request), communityId, requestId);
});

communityAction('confirmCommunityPledgeMailCallable', async (request) => {
  const { communityId, requestId } = parseRequestIdInput(request.data);
  await confirmPledgeMail(firestore(), callerOf(request), communityId, requestId);
});

communityAction('releaseCommunityPledgeMailCallable', async (request) => {
  const { communityId, requestId } = parseRequestIdInput(request.data);
  await releasePledgeMail(firestore(), callerOf(request), communityId, requestId);
});

// The admin removes any Request or Pledge (issue #3812): no per-Community
// switch, so the callables only check the caller is the Community's admin.
communityAction('removeCommunityRequestCallable', async (request) => {
  const { communityId, requestId } = parseRequestIdInput(request.data);
  await removeRequest(firestore(), callerOf(request), communityId, requestId);
});

// Fleet Payouts (issue #4779): creating counts the caller's open ones and links
// Members, so it is a callable; set-paid is the boss's own; remove is the boss or admin.
communityAction('createCommunityFleetPayoutCallable', (request) =>
  createFleetPayout(firestore(), callerOf(request), parseCreateFleetPayoutInput(request.data))
);

communityAction('setCommunityFleetShareDoneCallable', async (request) => {
  const { communityId, payoutId, shareId, paid } = parseSetFleetShareDoneInput(request.data);
  await setFleetShareDone(firestore(), callerOf(request), communityId, payoutId, shareId, paid);
});

communityAction('removeCommunityFleetPayoutCallable', async (request) => {
  const { communityId, payoutId } = parseFleetPayoutIdInput(request.data);
  await removeFleetPayout(firestore(), callerOf(request), communityId, payoutId);
});

communityAction('removeCommunityPledgeCallable', async (request) => {
  const { communityId, requestId, pledgeUid } = parseRemovePledgeInput(request.data);
  await removePledge(firestore(), callerOf(request), communityId, requestId, pledgeUid);
});

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

const corpTaxBookActions = createActionGroup();
/** A Corp Tax Book router action: no deployed function of its own. New callables use this. */
const corpTaxBookAction = (name: CallableAction<'corpTaxBook'>, handler: CallableHandler): void => {
  corpTaxBookActions.register(name, handler);
};

// Collector books (issue #4507): invite links for a feeder corporation. Codes only; the UI maps them later.
corpTaxBookAction('createCorpTaxBookFeederInviteCallable', (request) =>
  createFeederInvite(
    corpTaxBookDeps(),
    callerOf(request),
    parseCreateFeederInviteInput(request.data)
  )
);

corpTaxBookAction('revokeCorpTaxBookFeederInviteCallable', (request) =>
  revokeFeederInvite(
    corpTaxBookDeps(),
    callerOf(request),
    parseRevokeFeederInviteInput(request.data)
  )
);

// The consent screen's preview of a link: the accounting corporation and the offered rate.
corpTaxBookAction('previewCorpTaxBookFeederInviteCallable', (request) =>
  previewFeederInvite(
    corpTaxBookDeps(),
    callerOf(request),
    parsePreviewFeederInviteInput(request.data)
  )
);

corpTaxBookAction('acceptCorpTaxBookFeederInviteCallable', (request) =>
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
corpTaxBookAction('saveCorpTaxBookSyncGrantCallable', (request) =>
  saveCorpSyncGrant(corpSyncDeps(), callerOf(request), parseSaveCorpSyncGrantInput(request.data))
);

// Collector books (issue #4511): the moon owner's side. The grant is a separate SSO login by
// the Accountant alt (mining scope only); the first ledger pull is the role check.
corpTaxBookAction('saveCorpTaxBookFeederGrantCallable', (request) =>
  saveFeederGrant(
    { ...corpSyncDeps(), esi: esiSyncReader(), lookupCorporation: esiCorporationLookup() },
    callerOf(request),
    parseSaveFeederGrantInput(request.data)
  )
);

corpTaxBookAction('leaveCorpTaxBookFeederCallable', (request) =>
  leaveFeeder(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

corpTaxBookAction('getCorpTaxBookFeederStatusCallable', (request) =>
  getFeederStatus(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

// The moon owner's view (issue #4512): its officers (CEO, Director, Accountant; live role check)
// get a 24h access record the rules read, may ask for a rate, and dismiss the after-leaving view.
corpTaxBookAction('getCorpTaxBookFeederViewAccessCallable', (request) =>
  getFeederViewAccess(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

corpTaxBookAction('requestCorpTaxBookFeederRateCallable', (request) =>
  requestFeederRate(corpSyncDeps(), callerOf(request), parseRequestFeederRateInput(request.data))
);

// The moon owner names its payee: its own CEO, Directors and Accountants. The accounting
// corporation's officers set it too (#4653), through `setCorpTaxBookFeederPayeeFromBookCallable`.
corpTaxBookAction('setCorpTaxBookFeederPayeeCallable', (request) =>
  setFeederPayee(
    corpSyncDeps(),
    callerOf(request),
    parseSetFeederPayeeInput(request.data),
    esiIdCategoryLookup()
  )
);

corpTaxBookAction('dismissCorpTaxBookFeederHistoryCallable', (request) =>
  dismissFeederHistory(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

// The accounting corporation's side of a moon owner (issue #4586): officers agree a rate, settle
// otherwise and list open invite links. The view rebuild prices ore from R2, so these carry its secrets.
const feederOwnerDeps = (): BookDeps => ({ ...corpTaxBookDeps(), openPrices: r2OpenPrices });
corpTaxBookAction('setCorpTaxBookFeederRateCallable', (request) =>
  setFeederRate(feederOwnerDeps(), callerOf(request), parseSetFeederRateInput(request.data))
);

corpTaxBookAction('setCorpTaxBookFeederModeCallable', (request) =>
  setFeederMode(feederOwnerDeps(), callerOf(request), parseSetFeederModeInput(request.data))
);

// Refinery labels (issue #4640): the accounting side passes `feederCorporationId`; the moon owner's
// own officers do not.
corpTaxBookAction('setCorpTaxBookRefineryLabelCallable', (request) =>
  setRefineryLabel(feederOwnerDeps(), callerOf(request), parseSetRefineryLabelInput(request.data))
);

corpTaxBookAction('setCorpTaxBookOwnRefineryLabelCallable', (request) =>
  setOwnRefineryLabel(
    corpSyncDeps(),
    callerOf(request),
    parseSetOwnRefineryLabelInput(request.data)
  )
);

// A refinery's system (issue #4650): a miner's client reports what its own ledger placed it in.
corpTaxBookAction('learnCorpTaxBookRefinerySystemsCallable', (request) =>
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
corpTaxBookAction('setCorpTaxBookFeederPayeeFromBookCallable', (request) =>
  setBookFeederPayee(
    removalDeps(),
    callerOf(request),
    parseSetBookFeederPayeeInput(request.data),
    esiIdCategoryLookup()
  )
);

corpTaxBookAction('startCorpTaxBookFeederRemovalCallable', (request) =>
  startFeederRemoval(removalDeps(), callerOf(request), parseRemovalCall(request.data))
);

corpTaxBookAction('recordCorpTaxBookFeederRemovalSentCallable', (request) =>
  recordRemovalSent(removalDeps(), callerOf(request), parseRemovalNoticeCall(request.data))
);

corpTaxBookAction('cancelCorpTaxBookFeederRemovalCallable', (request) =>
  cancelFeederRemoval(removalDeps(), callerOf(request), parseRemovalCall(request.data))
);

corpTaxBookAction('getCorpTaxBookRemovalLinkCallable', (request) =>
  getRemovalLink(removalDeps(), callerOf(request), parseRemovalLinkCall(request.data))
);

corpTaxBookAction('forceCorpTaxBookRemovalCallable', (request) =>
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
  () =>
    bookVersioned(async () => {
      const summary = await finalizeDueRemovals(corpSyncDeps());
      logInfo('finalizeCorpTaxBookRemovals finished', { ...summary });
    })
);

// Paying a moon owner (issue #4514): record a payout, mark a journal row not a payout, and attach
// the wallet journal's outgoing donations to the records. Each rebuilds the moon owner's view.
corpTaxBookAction('recordCorpTaxBookFeederPayoutCallable', (request) =>
  recordFeederPayout(feederOwnerDeps(), callerOf(request), parseRecordPayoutInput(request.data))
);

corpTaxBookAction('markCorpTaxBookFeederPayoutCallable', (request) =>
  markFeederPayout(feederOwnerDeps(), callerOf(request), parseMarkPayoutInput(request.data))
);

corpTaxBookAction('reconcileCorpTaxBookFeederPayoutsCallable', (request) =>
  reconcileFeederPayoutsCall(
    { ...feederOwnerDeps(), esi: esiSyncReader() },
    callerOf(request),
    parseReconcilePayoutsInput(request.data)
  )
);

corpTaxBookAction('listCorpTaxBookFeederInvitesCallable', (request) =>
  listFeederInvites(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data))
);

// The holder revokes their own; the CEO revokes anyone's (live role check, so it carries an access token).
corpTaxBookAction('revokeCorpTaxBookSyncGrantCallable', (request) =>
  revokeCorpSyncGrant(corpSyncDeps(), callerOf(request), parseBookCall(request.data))
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
  () =>
    bookVersioned(async () => {
      const summary = await runScheduledCorpSyncs(corpSyncDeps(), esiSyncReader());
      logInfo('syncCorpTaxBooks finished', { ...summary });
    })
);

corpTaxBookAction('verifyCorpOfficerCallable', (request) =>
  verifyOfficer(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data))
);

corpTaxBookAction('turnOnCorpTaxBookCallable', (request) =>
  turnOnBook(corpTaxBookDeps(), callerOf(request), parseTurnOnInput(request.data))
);

// Whoever turned the book on (or the CEO) deletes it; the scheduled-sync grant is revoked with it.
corpTaxBookAction('deleteCorpTaxBookCallable', (request) =>
  deleteBook(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data), (corporationId) =>
    dropBookGrants(corpSyncDeps(), corporationId)
  )
);

corpTaxBookAction('reclaimCorpTaxBookCallable', (request) =>
  reclaimBook(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data))
);

// A sync is many small transactions (up to 2000 observer rows), so give it room.
corpTaxBookAction('syncCorpTaxBookCallable', (request) =>
  syncBook(corpTaxBookDeps(), callerOf(request), parseSyncInput(request.data, Date.now()))
);

corpTaxBookAction('editCorpTaxBookCallable', (request) =>
  editBook(
    corpTaxBookDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseEditAction(request.data)
  )
);

// SRP (ADR 0026): data under corps/{id}, written only by these callables. Router-only: each is
// an action of `corpTaxBookCall`, never its own deployed function (a deploy has a per-minute
// mutation quota). Clients call it through `callRouted`.
const srpDeps = (): SrpDeps => ({
  ...corpTaxBookDeps(),
  lookupCorporation: esiCorporationLookup(),
});

const srpFileDeps = (): SrpFileDeps => ({ ...srpDeps(), killmails: srpKillmailSource() });

corpTaxBookAction('verifySrpOfficerCallable', (request) =>
  verifySrpOfficer(srpDeps(), callerOf(request), parseBookCall(request.data))
);

// A member (no corp role, no corp scope): is SRP on for my corporation, and what are its rules.
corpTaxBookAction('getSrpStatusCallable', (request) =>
  getSrpStatus(srpDeps(), callerOf(request), parseBookCall(request.data))
);

// A member files an SRP Claim against their own killmail: the server verifies the loss and prices it.
corpTaxBookAction('fileSrpClaimCallable', (request) =>
  fileSrpClaim(
    srpFileDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseFileClaimInput(request.data)
  )
);

// A member sees the doctrine-fit result of their own loss before filing; nothing is written.
corpTaxBookAction('previewSrpDoctrineCheckCallable', (request) =>
  previewSrpDoctrineCheck(
    srpFileDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseFileClaimInput(request.data).ref
  )
);

// A Director adds or replaces a Doctrine Fit snapshot (the client builds it from pasted EFT or a Fitting).
corpTaxBookAction('saveSrpDoctrineCallable', (request) =>
  saveSrpDoctrine(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseSaveDoctrine(request.data)
  )
);

corpTaxBookAction('deleteSrpDoctrineCallable', (request) =>
  deleteSrpDoctrine(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseDeleteDoctrine(request.data)
  )
);

corpTaxBookAction('turnOnSrpCallable', (request) =>
  turnOnSrp(srpDeps(), callerOf(request), parseBookCall(request.data))
);

corpTaxBookAction('turnOffSrpCallable', (request) =>
  turnOffSrp(srpDeps(), callerOf(request), parseBookCall(request.data))
);

corpTaxBookAction('saveSrpSettingsCallable', (request) =>
  saveSrpSettings(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseSrpSettingsPatch((request.data as { settings?: unknown } | null)?.settings)
  )
);

// Officer queue: each re-checks Director/Accountant live and guards the state change in a transaction.
corpTaxBookAction('approveSrpClaimCallable', (request) =>
  approveSrpClaim(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseApproveItem(request.data)
  )
);

corpTaxBookAction('approveSrpClaimsCallable', (request) =>
  approveSrpClaims(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseApproveBatch(request.data)
  )
);

corpTaxBookAction('rejectSrpClaimCallable', (request) =>
  rejectSrpClaim(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseReject(request.data)
  )
);

corpTaxBookAction('changeSrpClaimAmountCallable', (request) =>
  changeSrpClaimAmount(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseChangeAmount(request.data)
  )
);

corpTaxBookAction('markSrpClaimPaidCallable', (request) =>
  markSrpClaimPaid(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseMarkPaidItem(request.data)
  )
);

corpTaxBookAction('markSrpClaimsPaidCallable', (request) =>
  markSrpClaimsPaid(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseMarkPaidBatch(request.data)
  )
);

corpTaxBookAction('reclaimSrpCallable', (request) =>
  reclaimSrp(srpDeps(), callerOf(request), parseBookCall(request.data))
);

// A player claims their own Unmatched donation (D5): uid-authorised, no officer role.
corpTaxBookAction('claimCorpTaxBookPaymentCallable', (request) => {
  const { corporationId, paymentId } = parseClaimPaymentInput(request.data);
  return claimPayment(corpTaxBookDeps(), callerOf(request), corporationId, paymentId);
});

corpTaxBookAction('confirmCorpTaxBookGroupingCallable', (request) => {
  const { corporationId, minerId } = parseConfirmGroupingInput(request.data);
  return confirmGrouping(corpTaxBookDeps(), callerOf(request), corporationId, minerId);
});

corpTaxBookAction('declineCorpTaxBookGroupingCallable', (request) => {
  const { corporationId, minerId } = parseConfirmGroupingInput(request.data);
  return declineGrouping(corpTaxBookDeps(), callerOf(request), corporationId, minerId);
});

corpTaxBookAction('listPendingCorpTaxBookGroupingsCallable', (request) =>
  listPendingGroupings(corpTaxBookDeps(), callerOf(request))
);

// No session on purpose: the verify link is the credential (D27), so a miner
// without an EVE login can read their Statement and stop reminders.
corpTaxBookAction('readCorpTaxBookStatementCallable', (request) =>
  readStatementByToken(corpTaxBookDeps(), parseToken(request.data))
);

// A decline needs only the link; a confirm never does (it needs the character's own sign-in).
corpTaxBookAction('declineCorpTaxBookGroupingByTokenCallable', (request) => {
  const { token, characterId } = parseDeclineByTokenInput(request.data);
  return declineGroupingByToken(corpTaxBookDeps(), token, characterId);
});

corpTaxBookAction('stopCorpTaxBookRemindersCallable', (request) => {
  const { token, stopped } = parseStopReminders(request.data);
  return setRemindersByToken(corpTaxBookDeps(), token, stopped);
});

// The Corp Tax Book router: the union of its callables' secrets and the longest timeout (a sync is many
// small transactions). Clients call this.
export const corpTaxBookCall = onCall<unknown>(
  { maxInstances: 10, secrets: FEEDER_VIEW_SECRETS, timeoutSeconds: 120 },
  (request) => bookVersioned(() => corpTaxBookActions.route(request))
);

/**
 * dailyHousekeeping (was three scheduled functions, to stay under the deploy quota and the
 * Cloud Scheduler free tier):
 * - the Notification Feed purge (`runPurgeNotificationFeed`, issue #595): daily rather than every
 *   5 minutes since the retention is 30 days. It needs the collection-group index on `firedAt` in
 *   firestore.indexes.json: deploy indexes before this function.
 * - purgeStaleAccounts (issue #2065): deletes the synced data of accounts with no successful sync
 *   in 90 days. Retention is by inactivity, not by Character removal, so it reaches accounts whose
 *   devices are all gone. The run-wide pass cap leaves a large backlog for the next tick.
 * - sweepCommunityRequests (issue #3812, ADR 0021): deletes Requests expired a week ago and
 *   Requests closed a week ago, with their Pledges. Bounded to 500 deletes a run; up to 500
 *   sequential reads and recursive deletes, so the function takes the 9-minute maximum timeout.
 * - sweepCommunityFleetPayouts (issue #4779): deletes Fleet Payouts expired a week ago, with
 *   their Shares. Bounded to 500 deletes a run.
 * - sweepSrpClaims (ADR 0026): deletes Paid and Rejected SRP Claims a year after
 *   they close, with their SRP log entries. Bounded to 500 deletes a run.
 * - purgeFiredProjections: deletes Scheduled Push rows fired more than 30 days ago (was every
 *   `dispatchProjections` tick, an empty billed query 96 times a day).
 * The three sweeps and the stale-account purge read with one query each (collection-group for
 * the sweeps, indexes in firestore.indexes.json, deployed by hand) and fall back to the old
 * per-parent scan until those indexes exist (indexedSweep.ts).
 */
export const dailyHousekeeping = onSchedule(
  { schedule: 'every 24 hours', secrets: [ALERTS_TOKEN_KEY], timeoutSeconds: 540 },
  () =>
    runDailyHousekeeping(
      [
        { name: 'purgeNotificationFeed', run: runPurgeNotificationFeed },
        {
          name: 'purgeFiredProjections',
          run: async () => {
            const { deleted, truncated } = await purgeFiredProjections(firestore(), Date.now());
            if (truncated) {
              logWarn('Fired projection purge: pass limit reached, backlog continues next run', {
                deleted,
              });
            }
          },
        },
        {
          name: 'purgeStaleAccounts',
          // Removing a purged account's sync grant writes its book's status (issue #5047).
          run: () => bookVersioned(() => runPurgeStaleAccounts({ alertGrantDeps, corpSyncDeps })),
        },
        {
          name: 'sweepCommunityRequests',
          run: async () => {
            const { deleted, failed, truncated } = await sweepRequests(firestore(), Date.now());
            if (failed > 0 || truncated) {
              logWarn('Community Request sweep incomplete, continues next run', {
                deleted,
                failed,
                truncated,
              });
            } else {
              logInfo('Community Request sweep done', { deleted, failed, truncated });
            }
          },
        },
        {
          name: 'sweepCommunityFleetPayouts',
          run: async () => {
            const { deleted, failed, truncated } = await sweepFleetPayouts(firestore(), Date.now());
            if (failed > 0 || truncated) {
              logWarn('Community Fleet Payout sweep incomplete, continues next run', {
                deleted,
                failed,
                truncated,
              });
            } else {
              logInfo('Community Fleet Payout sweep done', { deleted, failed, truncated });
            }
          },
        },
        {
          name: 'sweepSrpClaims',
          run: async () => {
            const { deleted, failed, truncated } = await sweepSrpClaims(firestore(), Date.now());
            if (failed > 0 || truncated) {
              logWarn('SRP claim sweep incomplete, continues next run', {
                deleted,
                failed,
                truncated,
              });
            } else {
              logInfo('SRP claim sweep done', { deleted, failed, truncated });
            }
          },
        },
      ],
      logError
    )
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
 * Every 60 minutes (issue #5066, was 30): the job was ~70% of billable function
 * time. An hourly publish leaves a snapshot up to ~90 minutes behind EVE Ref.
 * Memory stays 2GiB: the real peak was not measurable here (no read access to
 * the Cloud Run memory metric), so it is not lowered on a guess.
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
 * `dispatchProjections` and `dailyHousekeeping` — back inside the 3 free
 * per billing account ADR 0013 budgeted against, now that the blueprint-only
 * sync it briefly ran beside is gone.
 */
export const syncPublicContractOffers = onSchedule(
  {
    schedule: 'every 60 minutes',
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
