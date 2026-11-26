import { callerFromAuth, signedInCharacter, verifyAccessToken, type Caller } from './actorAuth.js';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { createActionGroup, type CallableHandler } from './callableRouter.js';
import { claimPlayerCharactersHandler } from './playerLayer.js';
import { firestorePlayerLayerStore } from './playerLayerStore.js';
import type { CallableAction } from './callableManifest.js';
import { runDailyHousekeeping } from './dailyHousekeeping.js';
import {
  NEW_LINK_WINDOW_MS,
  SHORT_LINK_LIMITS,
  checkNewLink,
  type CallerState,
  SURVEY_START_SHARE_TYPE,
  callerKey,
  PROXY_CLIENT_HEADER,
  PROXY_SECRET_HEADER,
  callerAddress,
  makeShortStartLink,
  type ShortLinkStore,
} from './shortStartLink.js';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { error as logError, info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { firestore } from './firestore.js';
import { Timestamp } from 'firebase-admin/firestore';
import {
  installBookWriteTracking,
  stampBook,
  withBookVersions,
} from './corpTaxBookVersionTracking.js';
import { runPurgeNotificationFeed, runPurgeStaleAccounts } from './purgeJobs.js';
import { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, r2ConfigOrThrow } from './r2Publish.js';
import { readOpenPricesFromR2 } from './r2DailySnapshots.js';
import { createR2Get } from './r2Publisher.js';
import { verifyEveAccessToken, verifyOptionsFromEnv, uidForCharacter } from './verifyEveToken.js';
import {
  AlertGrantError,
  deleteAlertGrant as deleteAlertGrantFor,
  grantCoversMail,
  grantCoversNearby,
  parseSaveAlertGrantInput,
  refreshAtSso,
  revokeAtSso,
  saveAlertGrant as saveAlertGrantFor,
  type AlertGrantDeps,
} from './alertGrant.js';
import { parseAlertsKey } from './alertGrantCrypto.js';
import { firestoreAlertGrantStore, firestorePollerStore } from './alertGrantStore.js';
import { firestoreNearbyStore, forgetNearbyCharacter } from './nearbyStore.js';
import { fetchCharacterLocation, fetchIncursions, fetchRaidableSkyhooks } from './esiNearby.js';
import type { PushMessage } from './eveNotificationPush.js';
import { runNearbyPhase } from './pollNearby.js';
import { fetchMailHeaders } from './esiMail.js';
import { fetchNotifications as fetchEsiNotifications } from './esiNotifications.js';
import { pollEveNotifications as pollEveNotificationsRun } from './pollEveNotifications.js';
import { buildDeviceRegistration, parseRegisterDeviceInput } from './registerDevice.js';
import {
  dispatchDueProjections,
  purgeFiredProjections,
  writeDeviceRegistration,
} from './projectionStore.js';
import { isHourlyTick } from './dispatchProjections.js';
import { pollServerEvents } from './serverEventPoll.js';
import { createRegistrationReader } from './registrationReader.js';
import { ALERTS_POLL_STATS_KEYS, SERVER_POLL_STATS_KEYS, createRunStats } from './runStats.js';
import { fetchFuzzworkPrices } from './serverEventSources.js';
import {
  deleteDeviceIfToken,
  listPolledDevices,
  onCommunityChildCreated,
  onPledgeCreated,
  saveServerBaselines,
} from './serverEventStore.js';
import {
  parseBookCall,
  parseClaimPaymentInput,
  parseDeclareOwnInput,
  parseDisputeConflictInput,
  parseWithdrawDisputeInput,
  parseConfirmGroupingInput,
  parseDeclineByTokenInput,
  parseEditAction,
  parseGroupingAnswerInput,
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
  SYNC_CORP_TAX_BOOKS_SCHEDULE,
  saveCorpSyncGrant,
  type CorpSyncDeps,
} from './corpSyncGrant.js';
import {
  createFeederInvite,
  parseCreateFeederInviteInput,
  parsePreviewFeederInviteInput,
  parseRevokeFeederInviteInput,
  previewFeederInvite,
  revokeFeederInvite,
} from './corpTaxBookFeeders.js';
import {
  addOwnFeeder,
  parseAddOwnFeederInput,
  parseRemoveOwnFeederInput,
  removeOwnFeeder,
} from './corpTaxBookOwnFeeder.js';
import { parseSyncMoonOwnersNowInput, syncMoonOwnersNow } from './corpTaxBookMoonOwnersSyncNow.js';
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
  disputeFeederPayout,
  getFeederViewAccess,
  parseDisputeFeederPayoutInput,
  parseRequestFeederRateInput,
  parseSetFeederPopSharingInput,
  requestFeederRate,
  setFeederPopSharing,
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
import { parseSetRefineryArchiveInput, setRefineryArchive } from './corpTaxBookRefineryArchive.js';
import {
  cancelFeederRemoval,
  claimFeederStaleMail,
  markFeederStaleMailSent,
  parseStaleMailSentCall,
  parseStaleMailClaimCall,
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
import { verifyAllBooks } from './corpTaxBookNightlyVerify.js';
import {
  claimPayment,
  declareOwnPayment,
  disputeConflict,
  withdrawDispute,
  confirmGrouping,
  declineGrouping,
  declineLink,
  declineGroupingByToken,
  listPendingGroupings,
  editBook,
  dismissGroupingAnswer,
  readStatementByToken,
  deleteBook,
  reclaimBook,
  setRemindersByToken,
  syncBook,
  turnOnBook,
  verifyOfficer,
  authorizeOfficer,
  type BookDeps,
} from './corpTaxBookStore.js';
import { esiAffiliations, esiCorporationAlliance } from './sharedPopsEsi.js';
import {
  listCommunityPopSharers,
  parseCommunityPopBlockInput,
  parseListSharedPopsInput,
  parseLinkSharedPopSurveyInput,
  linkSharedPopSurvey,
  provenViewers,
  setCommunityPopBlock,
  settingsCommunityIds,
  sharedPopsFor,
  sharingCommunities,
  type SharedPopsReadDeps,
} from './sharedPopsStore.js';
import { parseSrpSettingsPatch } from './srp.js';
import { getSrpClaimValues, parseClaimValuesInput } from './srpClaimValues.js';
import {
  deleteSrpDoctrine,
  listSrpDoctrineFits,
  previewSrpDoctrineCheck,
  saveSrpDoctrine,
} from './srpDoctrineStore.js';
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
import { sweepVetting } from './vettingCleanup.js';
import { esiVettingReader } from './vettingEsi.js';
import {
  parseVettingAddCharacter,
  parseVettingCorp,
  parseVettingDecide,
  parseVettingHandle,
  parseVettingInviteCode,
  parseVettingInviteLabel,
  parseVettingMember,
  parseVettingRemoveCharacter,
  parseVettingRequest,
  parseVettingRawRows,
  parseVettingReviewId,
  parseVettingSettingsPatch,
  parseVettingStart,
  parseVettingSubmit,
} from './vettingParse.js';
import {
  addVettingCharacter,
  createVettingInvite,
  declineVetting,
  decideVettingReview,
  getVettingCorp,
  getVettingOverview,
  getVettingStatus,
  listMyVettingRequests,
  getVettingRawRows,
  openVettingReview,
  removeVettingCharacter,
  recordVettingRequestMail,
  requestVettingReview,
  revokeVettingInvite,
  saveVettingSettings,
  startVetting,
  submitVetting,
  withdrawVetting,
  type VettingDeps,
} from './vettingStore.js';
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
installBookWriteTracking();
const bookVersioned = <T>(handler: () => T | Promise<T>): Promise<T> =>
  withBookVersions((id, touched) => stampBook(firestore(), id, touched), handler, logError);

const verifyOptions = verifyOptionsFromEnv({
  allowMissingClientId: process.env.FUNCTIONS_EMULATOR === 'true',
});

export const mintFirebaseToken = onCall<{ accessToken?: unknown }>(
  { maxInstances: 5 },
  async (request) => {
    const accessToken = request.data?.accessToken;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new HttpsError('invalid-argument', 'accessToken (string) is required');
    }

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
    const token = await getAuth().createCustomToken(uid, { ownerHash: claims.ownerHash });
    return { token, uid, ownerHash: claims.ownerHash };
  }
);

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

  const {
    registration,
    rejected,
    projections,
    eveTypesByCharacter,
    serverEventsByCharacter,
    serverInputsByCharacter,
  } = await buildDeviceRegistration(input, verifyOptions, logError);

  if (registration.characterIds.length === 0) {
    throw new HttpsError('unauthenticated', 'No character access token could be verified');
  }

  await writeDeviceRegistration(firestore(), {
    deviceId: input.deviceId,
    fcmToken: registration.fcmToken,
    characterIds: registration.characterIds,
    projections,
    eveTypesByCharacter,
    serverEventsByCharacter,
    serverInputsByCharacter,
    routeRules: input.routeRules,
    quietHours: input.quietHours,
  });

  const { store } = alertGrantDeps();
  const seenTypes: Record<string, string[]> = {};
  let nearbyGrants: number[] | undefined = [];
  const mailGrants: number[] = [];
  try {
    const grants = await store.getMany(registration.characterIds);
    for (const characterId of registration.characterIds) {
      const grant = grants.get(characterId);
      seenTypes[String(characterId)] = grant?.seenTypes ?? [];
      if (grant?.status === 'active' && grantCoversNearby(grant)) nearbyGrants?.push(characterId);
      if (grant?.status === 'active' && grantCoversMail(grant)) mailGrants.push(characterId);
    }
  } catch (err) {
    nearbyGrants = undefined;
    logError('Device registration: seenTypes read failed', {
      characterIds: registration.characterIds,
      error: String(err),
    });
  }

  return {
    deviceId: input.deviceId,
    registered: registration.characterIds,
    rejected,
    seenTypes,
    ...(nearbyGrants ? { nearbyGrants, mailGrants } : {}),
  };
});

const ALERTS_TOKEN_KEY = defineSecret('ALERTS_TOKEN_KEY');
const FEEDER_VIEW_SECRETS = [ALERTS_TOKEN_KEY, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY];

function alertGrantDeps(): AlertGrantDeps {
  return {
    store: firestoreAlertGrantStore(firestore()),
    key: () => parseAlertsKey(ALERTS_TOKEN_KEY.value()),
    verify: (accessToken) => verifyEveAccessToken(accessToken, verifyOptions),
    refresh: (clientId, refreshToken) => refreshAtSso(clientId, refreshToken),
    revoke: (clientId, refreshToken) => revokeAtSso(clientId, refreshToken),
    now: () => Date.now(),
    log: (message, data) => logWarn(message, data),
    forgetNearby: (characterId) => forgetNearbyCharacter(firestore(), characterId),
  };
}

function alertGrantHttpsError(err: unknown): never {
  if (err instanceof AlertGrantError) throw new HttpsError(err.code, err.message);
  logError('Alerts Grant call failed', { error: err instanceof Error ? err.name : 'unknown' });
  throw new HttpsError('internal', 'Alerts Grant call failed');
}

alertsAction('saveAlertGrant', async (request) => {
  try {
    return await saveAlertGrantFor(alertGrantDeps(), parseSaveAlertGrantInput(request.data));
  } catch (err) {
    return alertGrantHttpsError(err);
  }
});

alertsAction('deleteAlertGrant', async (request) => {
  const characterId = signedInCharacter(callerOf(request));
  try {
    return await deleteAlertGrantFor(alertGrantDeps(), characterId);
  } catch (err) {
    return alertGrantHttpsError(err);
  }
});

export const alertsCall = onCall<unknown>(
  { maxInstances: 10, secrets: [ALERTS_TOKEN_KEY] },
  (request) => bookVersioned(() => alertsActions.route(request))
);

export const dispatchProjections = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeoutSeconds: 540,
    maxInstances: 1,
    secrets: FEEDER_VIEW_SECRETS,
  },
  async () => {
    const db = firestore();
    const messaging = getMessaging();
    const serverStats = createRunStats(SERVER_POLL_STATS_KEYS);
    const [projected, polled] = await Promise.allSettled([
      dispatchDueProjections(db, messaging, Date.now(), logError),
      pollServerEvents({
        listDevices: () => listPolledDevices(db, serverStats),
        fetchPrices: (stationId, typeIds) => fetchFuzzworkPrices(stationId, typeIds),
        send: async (token, data) => {
          serverStats.add('fcmSends');
          await messaging.send({ token, data });
        },
        saveBaselines: (deviceId, baselines) =>
          saveServerBaselines(db, deviceId, baselines, serverStats),
        deleteDevice: (deviceId, fcmToken) =>
          deleteDeviceIfToken(db, deviceId, fcmToken, serverStats),
        log: (message, data) => logWarn(message, data),
        now: () => Date.now(),
        stats: serverStats,
      }),
    ]);
    if (projected.status === 'rejected')
      logError('Scheduled Push dispatch failed', { error: String(projected.reason) });
    if (polled.status === 'rejected')
      logError('Server event poll failed', { error: String(polled.reason) });
    else logInfo('Server event poll finished', { ...polled.value, ...serverStats.snapshot() });
    if (isHourlyTick(Date.now())) {
      try {
        const summary = await bookVersioned(() => finalizeDueRemovals(corpSyncDeps()));
        logInfo('finalizeCorpTaxBookRemovals finished', { ...summary });
      } catch (error) {
        logError('finalizeCorpTaxBookRemovals failed', { error: String(error) });
      }
    }
  }
);

export const pushCommunityAlert = onDocumentCreated(
  'communities/{communityId}/{collection}/{docId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { communityId, collection, docId } = event.params;
    await onCommunityChildCreated(
      firestore(),
      getMessaging(),
      { communityId, collection, docId },
      data,
      Date.now(),
      logWarn
    );
  }
);

export const pushCommunityPledge = onDocumentCreated(
  'communities/{communityId}/itemRequests/{requestId}/pledges/{pledgerUid}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { communityId, requestId, pledgerUid } = event.params;
    await onPledgeCreated(
      firestore(),
      getMessaging(),
      { communityId, requestId, pledgerUid },
      data,
      Date.now(),
      logWarn
    );
  }
);

export const pollEveNotifications = onSchedule(
  {
    schedule: 'every 15 minutes',
    secrets: [ALERTS_TOKEN_KEY],
    timeoutSeconds: 540,
    maxInstances: 1,
  },
  async () => {
    const messaging = getMessaging();
    const stats = createRunStats(ALERTS_POLL_STATS_KEYS);
    const registrations = createRegistrationReader(firestore(), stats);
    const once = <T>(read: () => Promise<T>): (() => Promise<T>) => {
      let pending: Promise<T> | undefined;
      return () => (pending ??= read());
    };
    const incursions = once(() => {
      stats.add('esiIncursionsCalls');
      return fetchIncursions();
    });
    const skyhooks = once(() => {
      stats.add('esiSkyhooksCalls');
      return fetchRaidableSkyhooks();
    });
    const send = async (token: string, message: PushMessage) => {
      stats.add('fcmSends');
      await messaging.send({
        token,
        data: message.data,
        ...(message.collapseKey ? { webpush: { headers: { Topic: message.collapseKey } } } : {}),
      });
    };
    const log = (message: string, data?: Record<string, unknown>) => logWarn(message, data);
    const summary = await pollEveNotificationsRun({
      store: firestorePollerStore(firestore(), {
        key: () => parseAlertsKey(ALERTS_TOKEN_KEY.value()),
        refresh: (clientId, refreshToken) => refreshAtSso(clientId, refreshToken),
        stats,
        registrations,
      }),
      stats,
      fetchNotifications: (characterId, accessToken, etag) =>
        fetchEsiNotifications(characterId, accessToken, etag),
      send,
      log,
      mail: {
        fetchHeaders: (characterId, accessToken, etag) =>
          fetchMailHeaders(characterId, accessToken, etag),
      },
      nearby: {
        fetchLocation: (characterId, accessToken) =>
          fetchCharacterLocation(characterId, accessToken),
        hasCandidates: async (wanted) => {
          const [incursionList, skyhookList] = await Promise.all([
            wanted.incursions ? incursions() : null,
            wanted.skyhooks ? skyhooks() : null,
          ]);
          const empty = (read: { kind: string; value?: unknown[] } | null) =>
            read === null || (read.kind === 'ok' && read.value?.length === 0);
          return !(empty(incursionList) && empty(skyhookList));
        },
        runPhase: (locations) =>
          runNearbyPhase({
            deps: {
              store: firestoreNearbyStore(firestore(), { registrations, stats }),
              fetchIncursions: incursions,
              fetchRaidableSkyhooks: skyhooks,
            },
            locations,
            send,
            log,
            nowMs: Date.now(),
          }),
      },
    });
    logInfo('pollEveNotifications finished', { ...summary, ...stats.snapshot() });
  }
);

function callerOf(request: { auth?: { uid: string; token: Record<string, unknown> } }): Caller {
  return callerFromAuth(request.auth);
}

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

communityAction('removeCommunityRequestCallable', async (request) => {
  const { communityId, requestId } = parseRequestIdInput(request.data);
  await removeRequest(firestore(), callerOf(request), communityId, requestId);
});

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

communityAction('listCommunityPopSharersCallable', (request) =>
  listCommunityPopSharers(
    sharedPopsReadDeps(),
    callerOf(request),
    parseCommunityIdInput(request.data).communityId
  )
);

communityAction('setCommunityPopSharingBlockCallable', (request) =>
  setCommunityPopBlock(
    firestore(),
    callerOf(request),
    parseCommunityPopBlockInput(request.data),
    Date.now()
  )
);

communityAction('removeCommunityPledgeCallable', async (request) => {
  const { communityId, requestId, pledgeUid } = parseRemovePledgeInput(request.data);
  await removePledge(firestore(), callerOf(request), communityId, requestId, pledgeUid);
});

const corpTaxBookDeps = (): BookDeps => ({
  db: firestore(),
  now: Date.now,
  verifyToken: (token) => verifyEveAccessToken(token, verifyOptions),
  readIdentity: esiIdentityReader(),
  corporationAlliance: esiCorporationAlliance(),
});

const sharedPopAffiliations = esiAffiliations();
const sharedPopsReadDeps = (): SharedPopsReadDeps => ({
  db: firestore(),
  now: Date.now,
  affiliations: sharedPopAffiliations,
});

const corpTaxBookActions = createActionGroup();
const corpTaxBookAction = (name: CallableAction<'corpTaxBook'>, handler: CallableHandler): void => {
  corpTaxBookActions.register(name, handler);
};

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

corpTaxBookAction('previewCorpTaxBookFeederInviteCallable', (request) =>
  previewFeederInvite(
    corpTaxBookDeps(),
    callerOf(request),
    parsePreviewFeederInviteInput(request.data)
  )
);

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
    corporationAlliance: esiCorporationAlliance(),
    log: (message, data) => logWarn(message, data),
    push: getMessaging(),
  };
}

function r2OpenPrices(typeId: number): Promise<unknown | null> {
  return readOpenPricesFromR2(createR2Get(r2ConfigOrThrow()), typeId);
}
corpTaxBookAction('saveCorpTaxBookSyncGrantCallable', (request) =>
  saveCorpSyncGrant(corpSyncDeps(), callerOf(request), parseSaveCorpSyncGrantInput(request.data))
);

corpTaxBookAction('saveCorpTaxBookFeederGrantCallable', (request) =>
  saveFeederGrant(
    { ...corpSyncDeps(), esi: esiSyncReader(), lookupCorporation: esiCorporationLookup() },
    callerOf(request),
    parseSaveFeederGrantInput(request.data)
  )
);

corpTaxBookAction('addOwnCorpTaxBookFeederCallable', (request) =>
  addOwnFeeder(
    { ...corpSyncDeps(), esi: esiSyncReader(), lookupCorporation: esiCorporationLookup() },
    callerOf(request),
    parseAddOwnFeederInput(request.data)
  )
);

corpTaxBookAction('removeOwnCorpTaxBookFeederCallable', (request) =>
  removeOwnFeeder(corpSyncDeps(), callerOf(request), parseRemoveOwnFeederInput(request.data))
);

corpTaxBookAction('syncCorpTaxBookMoonOwnersNowCallable', (request) =>
  syncMoonOwnersNow(
    { ...corpSyncDeps(), esi: esiSyncReader() },
    callerOf(request),
    parseSyncMoonOwnersNowInput(request.data)
  )
);

corpTaxBookAction('leaveCorpTaxBookFeederCallable', (request) =>
  leaveFeeder(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

corpTaxBookAction('getCorpTaxBookFeederStatusCallable', (request) =>
  getFeederStatus(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

corpTaxBookAction('getCorpTaxBookFeederViewAccessCallable', (request) =>
  getFeederViewAccess(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

corpTaxBookAction('requestCorpTaxBookFeederRateCallable', (request) =>
  requestFeederRate(corpSyncDeps(), callerOf(request), parseRequestFeederRateInput(request.data))
);

corpTaxBookAction('disputeCorpTaxBookFeederPayoutCallable', (request) =>
  disputeFeederPayout(
    corpSyncDeps(),
    callerOf(request),
    parseDisputeFeederPayoutInput(request.data)
  )
);

corpTaxBookAction('setCorpTaxBookFeederPayeeCallable', (request) =>
  setFeederPayee(
    corpSyncDeps(),
    callerOf(request),
    parseSetFeederPayeeInput(request.data),
    esiIdCategoryLookup()
  )
);

corpTaxBookAction('setCorpTaxBookFeederPopSharingCallable', (request) =>
  setFeederPopSharing(
    corpSyncDeps(),
    callerOf(request),
    parseSetFeederPopSharingInput(request.data)
  )
);

corpTaxBookAction('listSharedPopsCallable', async (request) => {
  const caller = callerOf(request);
  const { accessTokens } = parseListSharedPopsInput(request.data);
  const viewers = await provenViewers(caller, accessTokens, async (token) => {
    const claims = await verifyEveAccessToken(token, verifyOptions);
    return { characterId: claims.characterId, ownerHash: claims.ownerHash };
  });
  return { pops: await sharedPopsFor(sharedPopsReadDeps(), viewers) };
});

corpTaxBookAction('linkSharedPopSurveyCallable', (request) =>
  linkSharedPopSurvey(
    sharedPopsReadDeps(),
    callerOf(request),
    parseLinkSharedPopSurveyInput(request.data)
  )
);

corpTaxBookAction('getCorpTaxBookPopSharingCommunitiesCallable', async (request) => {
  const call = parseBookCall(request.data);
  await authorizeOfficer(corpTaxBookDeps(), callerOf(request), call, 'view', { live: false });
  const deps = sharedPopsReadDeps();
  const ids = await settingsCommunityIds(deps.db, call.corporationId);
  const status = await sharingCommunities(deps, call.corporationId, ids);
  return { communities: Object.fromEntries(status) };
});

corpTaxBookAction('dismissCorpTaxBookFeederHistoryCallable', (request) =>
  dismissFeederHistory(corpSyncDeps(), callerOf(request), parseFeederCall(request.data))
);

const feederOwnerDeps = (): BookDeps => ({ ...corpTaxBookDeps(), openPrices: r2OpenPrices });
corpTaxBookAction('setCorpTaxBookFeederRateCallable', (request) =>
  setFeederRate(feederOwnerDeps(), callerOf(request), parseSetFeederRateInput(request.data))
);

corpTaxBookAction('setCorpTaxBookFeederModeCallable', (request) =>
  setFeederMode(feederOwnerDeps(), callerOf(request), parseSetFeederModeInput(request.data))
);

corpTaxBookAction('setCorpTaxBookRefineryLabelCallable', (request) =>
  setRefineryLabel(feederOwnerDeps(), callerOf(request), parseSetRefineryLabelInput(request.data))
);

corpTaxBookAction('setCorpTaxBookRefineryArchiveCallable', (request) =>
  setRefineryArchive(
    feederOwnerDeps(),
    callerOf(request),
    parseSetRefineryArchiveInput(request.data)
  )
);

corpTaxBookAction('setCorpTaxBookOwnRefineryLabelCallable', (request) =>
  setOwnRefineryLabel(
    corpSyncDeps(),
    callerOf(request),
    parseSetOwnRefineryLabelInput(request.data)
  )
);

corpTaxBookAction('learnCorpTaxBookRefinerySystemsCallable', (request) =>
  learnRefinerySystems(
    corpTaxBookDeps(),
    callerOf(request),
    parseLearnRefinerySystemsInput(request.data)
  )
);

const removalDeps = (): BookDeps => ({
  ...feederOwnerDeps(),
  corporationCeo: esiCorporationCeoLookup(),
});

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

corpTaxBookAction('claimCorpTaxBookFeederStaleMailCallable', (request) =>
  claimFeederStaleMail(removalDeps(), callerOf(request), parseStaleMailClaimCall(request.data))
);

corpTaxBookAction('markCorpTaxBookFeederStaleMailSentCallable', (request) =>
  markFeederStaleMailSent(removalDeps(), callerOf(request), parseStaleMailSentCall(request.data))
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

corpTaxBookAction('revokeCorpTaxBookSyncGrantCallable', (request) =>
  revokeCorpSyncGrant(corpSyncDeps(), callerOf(request), parseBookCall(request.data))
);

export const syncCorpTaxBooks = onSchedule(
  {
    ...SYNC_CORP_TAX_BOOKS_SCHEDULE,
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

corpTaxBookAction('deleteCorpTaxBookCallable', (request) =>
  deleteBook(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data), (corporationId) =>
    dropBookGrants(corpSyncDeps(), corporationId)
  )
);

corpTaxBookAction('reclaimCorpTaxBookCallable', (request) =>
  reclaimBook(corpTaxBookDeps(), callerOf(request), parseBookCall(request.data))
);

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

corpTaxBookAction('dismissGroupingAnswer', (request) =>
  dismissGroupingAnswer(
    corpTaxBookDeps(),
    callerOf(request),
    parseGroupingAnswerInput(request.data)
  )
);

const srpDeps = (): SrpDeps => ({
  ...corpTaxBookDeps(),
  lookupCorporation: esiCorporationLookup(),
});

const srpFileDeps = (): SrpFileDeps => ({ ...srpDeps(), killmails: srpKillmailSource() });

corpTaxBookAction('verifySrpOfficerCallable', (request) =>
  verifySrpOfficer(srpDeps(), callerOf(request), parseBookCall(request.data))
);

corpTaxBookAction('getSrpStatusCallable', (request) =>
  getSrpStatus(srpDeps(), callerOf(request), parseBookCall(request.data))
);

corpTaxBookAction('fileSrpClaimCallable', (request) =>
  fileSrpClaim(
    srpFileDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseFileClaimInput(request.data)
  )
);

corpTaxBookAction('previewSrpDoctrineCheckCallable', (request) =>
  previewSrpDoctrineCheck(
    srpFileDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseFileClaimInput(request.data).ref
  )
);

corpTaxBookAction('getSrpClaimValuesCallable', (request) =>
  getSrpClaimValues(
    srpFileDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseClaimValuesInput(request.data)
  )
);

corpTaxBookAction('saveSrpDoctrineCallable', (request) =>
  saveSrpDoctrine(
    srpDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseSaveDoctrine(request.data)
  )
);

corpTaxBookAction('listSrpDoctrineFitsCallable', (request) =>
  listSrpDoctrineFits(srpDeps(), callerOf(request), parseBookCall(request.data))
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

corpTaxBookAction('claimCorpTaxBookPaymentCallable', (request) => {
  const { corporationId, paymentId, inReview } = parseClaimPaymentInput(request.data);
  return claimPayment(corpTaxBookDeps(), callerOf(request), corporationId, paymentId, {
    ...(inReview ? { inReview } : {}),
  });
});

corpTaxBookAction('declareCorpTaxBookPaymentCallable', (request) =>
  declareOwnPayment(corpTaxBookDeps(), callerOf(request), parseDeclareOwnInput(request.data))
);

corpTaxBookAction('disputeCorpTaxBookConflictCallable', (request) =>
  disputeConflict(corpTaxBookDeps(), callerOf(request), parseDisputeConflictInput(request.data))
);

corpTaxBookAction('withdrawCorpTaxBookDisputeCallable', (request) =>
  withdrawDispute(corpTaxBookDeps(), callerOf(request), parseWithdrawDisputeInput(request.data))
);

corpTaxBookAction('confirmCorpTaxBookGroupingCallable', (request) => {
  const { corporationId, minerId } = parseConfirmGroupingInput(request.data);
  return confirmGrouping(corpTaxBookDeps(), callerOf(request), corporationId, minerId);
});

corpTaxBookAction('declineCorpTaxBookGroupingCallable', (request) => {
  const { corporationId, minerId } = parseConfirmGroupingInput(request.data);
  return declineGrouping(corpTaxBookDeps(), callerOf(request), corporationId, minerId);
});

corpTaxBookAction('declineCorpTaxBookLinkCallable', (request) => {
  const { corporationId, minerId } = parseConfirmGroupingInput(request.data);
  return declineLink(corpTaxBookDeps(), callerOf(request), corporationId, minerId);
});

corpTaxBookAction('claimPlayerCharactersCallable', (request) =>
  claimPlayerCharactersHandler({
    store: firestorePlayerLayerStore(firestore()),
    verify: (accessToken) => verifyEveAccessToken(accessToken, verifyOptions),
    now: () => Date.now(),
    log: (message, data) => logWarn(message, data),
  })(request)
);

corpTaxBookAction('listPendingCorpTaxBookGroupingsCallable', (request) =>
  listPendingGroupings(corpTaxBookDeps(), callerOf(request))
);

corpTaxBookAction('readCorpTaxBookStatementCallable', (request) =>
  readStatementByToken(corpTaxBookDeps(), parseToken(request.data))
);

corpTaxBookAction('declineCorpTaxBookGroupingByTokenCallable', (request) => {
  const { token, characterId } = parseDeclineByTokenInput(request.data);
  return declineGroupingByToken(corpTaxBookDeps(), token, characterId);
});

corpTaxBookAction('stopCorpTaxBookRemindersCallable', (request) => {
  const { token, stopped } = parseStopReminders(request.data);
  return setRemindersByToken(corpTaxBookDeps(), token, stopped);
});

export const corpTaxBookCall = onCall<unknown>(
  { maxInstances: 10, secrets: FEEDER_VIEW_SECRETS, timeoutSeconds: 120 },
  (request) => bookVersioned(() => corpTaxBookActions.route(request))
);

const vettingDeps = (): VettingDeps => ({
  ...srpDeps(),
  esi: esiVettingReader(),
  push: getMessaging(),
  logWarn,
});

const vettingActions = createActionGroup();
const vettingAction = (name: CallableAction<'vetting'>, handler: CallableHandler): void => {
  vettingActions.register(name, handler);
};
export const vettingCall = onCall<unknown>({ maxInstances: 10, timeoutSeconds: 120 }, (request) =>
  vettingActions.route(request)
);

vettingAction('getVettingCorpCallable', (request) =>
  getVettingCorp(vettingDeps(), parseVettingCorp(request.data))
);
vettingAction('startVettingCallable', (request) =>
  startVetting(vettingDeps(), parseVettingStart(request.data))
);
vettingAction('addVettingCharacterCallable', (request) =>
  addVettingCharacter(vettingDeps(), parseVettingAddCharacter(request.data))
);
vettingAction('removeVettingCharacterCallable', (request) =>
  removeVettingCharacter(vettingDeps(), parseVettingRemoveCharacter(request.data))
);
vettingAction('submitVettingCallable', (request) =>
  submitVetting(vettingDeps(), parseVettingSubmit(request.data))
);
vettingAction('getVettingStatusCallable', (request) =>
  getVettingStatus(vettingDeps(), parseVettingHandle(request.data))
);
vettingAction('withdrawVettingCallable', (request) =>
  withdrawVetting(vettingDeps(), parseVettingHandle(request.data))
);
vettingAction('declineVettingCallable', (request) =>
  declineVetting(vettingDeps(), parseVettingHandle(request.data))
);
vettingAction('listMyVettingRequestsCallable', (request) =>
  listMyVettingRequests(vettingDeps(), callerOf(request), parseVettingMember(request.data))
);
vettingAction('getVettingOverviewCallable', (request) =>
  getVettingOverview(vettingDeps(), callerOf(request), parseBookCall(request.data))
);
vettingAction('openVettingReviewCallable', (request) =>
  openVettingReview(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingReviewId(request.data)
  )
);
vettingAction('getVettingRawRowsCallable', (request) =>
  getVettingRawRows(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingRawRows(request.data)
  )
);
vettingAction('decideVettingReviewCallable', (request) =>
  decideVettingReview(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingDecide(request.data)
  )
);
vettingAction('requestVettingReviewCallable', (request) =>
  requestVettingReview(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingRequest(request.data)
  )
);
vettingAction('recordVettingRequestMailCallable', (request) =>
  recordVettingRequestMail(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingReviewId(request.data)
  )
);
vettingAction('createVettingInviteCallable', (request) =>
  createVettingInvite(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingInviteLabel(request.data)
  )
);
vettingAction('revokeVettingInviteCallable', (request) =>
  revokeVettingInvite(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingInviteCode(request.data)
  )
);
vettingAction('saveVettingSettingsCallable', (request) =>
  saveVettingSettings(
    vettingDeps(),
    callerOf(request),
    parseBookCall(request.data),
    parseVettingSettingsPatch(request.data)
  )
);

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
          name: 'verifyBookDocs',
          run: async () => {
            const { books, failed, truncated } = await bookVersioned(() =>
              verifyAllBooks(firestore(), Date.now)
            );
            if (failed > 0 || truncated) {
              logWarn('Book docs verifier incomplete, continues next run', {
                books,
                failed,
                truncated,
              });
            } else {
              logInfo('Book docs verifier done', { books, failed, truncated });
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
        {
          name: 'sweepVetting',
          run: async () => {
            const done = await sweepVetting(firestore(), Date.now());
            if (done.failed > 0 || done.truncated) {
              logWarn('Vetting sweep incomplete, continues next run', { ...done });
            } else {
              logInfo('Vetting sweep done', { ...done });
            }
          },
        },
      ],
      logError
    )
);

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

const shortLinkStore: ShortLinkStore = {
  claim: (id, search, caller, now, expiresAt) => {
    const ref = firestore().collection('shares').doc(id);
    const limitRef = firestore().collection(SHORT_LINK_LIMITS).doc(caller);
    return firestore().runTransaction(async (tx) => {
      const [held, limit] = await Promise.all([tx.get(ref), tx.get(limitRef)]);
      const data = held.data() as
        { payload?: { search?: unknown }; expiresAt?: { toMillis(): number } } | undefined;
      const live = data?.expiresAt !== undefined && data.expiresAt.toMillis() > now;
      if (held.exists && live && data?.payload?.search !== search) return 'taken' as const;
      if (!(held.exists && live)) {
        const stored = limit.data() as Partial<CallerState> | undefined;
        const state: CallerState | null =
          stored?.lastAt === undefined
            ? null
            : {
                lastAt: stored.lastAt,
                windowStart: stored.windowStart ?? stored.lastAt,
                count: stored.count ?? 1,
              };
        const check = checkNewLink(state, now);
        if (!check.ok) return { limitedFor: check.limitedFor, reason: check.reason };
        tx.set(limitRef, {
          ...check.next,
          expiresAt: Timestamp.fromMillis(check.next.windowStart + NEW_LINK_WINDOW_MS),
        });
      }
      tx.set(ref, {
        type: SURVEY_START_SHARE_TYPE,
        payload: { v: 1, search },
        createdAt: Timestamp.fromMillis(now),
        expiresAt: Timestamp.fromMillis(expiresAt),
      });
      return 'ok' as const;
    });
  },
};

export const shortStartLink = onRequest(
  { cors: true, maxInstances: 5 },
  async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'POST') {
      response.set('Allow', 'GET, POST').status(405).json({ error: 'use GET or POST' });
      return;
    }
    const input = request.method === 'POST' ? request.body : request.query;
    try {
      const result = await makeShortStartLink(
        input,
        shortLinkStore,
        callerKey(
          callerAddress({
            proxyClient: request.get(PROXY_CLIENT_HEADER),
            proxySecret: request.get(PROXY_SECRET_HEADER),
            forwardedFor: request.headers['x-forwarded-for'],
            ip: request.ip,
            expectedSecret: process.env.SHORT_LINK_PROXY_SECRET,
          })
        ),
        Date.now(),
        process.env.APP_URL ?? 'https://neocomdesk.com'
      );
      if (result.headers) response.set(result.headers);
      response.status(result.status).json(result.body);
    } catch (err) {
      logError('shortStartLink failed', err);
      response.status(500).json({ error: 'could not make a short link' });
    }
  }
);
