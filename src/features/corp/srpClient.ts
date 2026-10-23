/**
 * SRP's backend as the client sees it (issue #4848, epic #4608, ADR 0026): every write goes
 * through the callables in functions/src/srp*.ts. Only a short-lived access token is sent, for
 * the live role check or the member check; the refresh token never leaves Dexie.
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { srpBackendOverride } from './srpBackendOverride';
import { call } from './taxBook/bookClient';
import type {
  FileSrpClaimInput,
  FiledSrpClaim,
  SrpOfficerVerdict,
  SrpSettings,
  SrpSettingsPatch,
  SrpStatus,
} from './srpTypes';

/**
 * An officer reads `corps/{id}/srp/settings` under the rules, so `verifySrpOfficer` comes first
 * (it records the 24-hour officer access). Null before SRP was ever turned on.
 */
export async function readSrpSettings(
  characterId: number,
  corporationId: number
): Promise<SrpSettings | null> {
  const stand = srpBackendOverride();
  if (stand) return stand.readSettings();
  await ensureSignedIn(characterId);
  const snap = await getDoc(
    doc(getSyncFirestore(), 'corps', String(corporationId), 'srp', 'settings')
  );
  return snap.exists() ? (snap.data() as SrpSettings) : null;
}

/** Checks the Character's roles with ESI and records officer access for 24 hours. */
export async function verifySrpOfficer(
  characterId: number,
  corporationId: number
): Promise<SrpOfficerVerdict> {
  const stand = srpBackendOverride();
  if (stand) return stand.verify();
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'verifySrpOfficerCallable', { corporationId, accessToken });
}

/** Any member: is SRP on for the corporation, and the rules a claim is priced by. */
export async function getSrpStatus(characterId: number, corporationId: number): Promise<SrpStatus> {
  const stand = srpBackendOverride();
  if (stand) return stand.status();
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'getSrpStatusCallable', { corporationId, accessToken });
}

/** A Director turns SRP on (or back on, keeping the saved rules). */
export async function turnOnSrp(characterId: number, corporationId: number): Promise<void> {
  const stand = srpBackendOverride();
  if (stand) return stand.turnOn();
  const accessToken = await getValidAccessToken(characterId);
  await call(characterId, 'turnOnSrpCallable', { corporationId, accessToken });
}

/** A Director turns SRP off: members stop seeing it; claims and rules are kept. */
export async function turnOffSrp(characterId: number, corporationId: number): Promise<void> {
  const stand = srpBackendOverride();
  if (stand) return stand.turnOff();
  const accessToken = await getValidAccessToken(characterId);
  await call(characterId, 'turnOffSrpCallable', { corporationId, accessToken });
}

/** A Director saves any of the percents, Hull Rules, claim window and Fleet-or-FC requirement. */
export async function saveSrpSettings(
  characterId: number,
  corporationId: number,
  settings: SrpSettingsPatch
): Promise<void> {
  const stand = srpBackendOverride();
  if (stand) return stand.save(settings);
  const accessToken = await getValidAccessToken(characterId);
  await call(characterId, 'saveSrpSettingsCallable', { corporationId, accessToken, settings });
}

/** The CEO reclaims SRP: becomes owner, turns it on, and every other officer must re-verify. */
export async function reclaimSrp(
  characterId: number,
  corporationId: number
): Promise<{ officersRevoked: number }> {
  const stand = srpBackendOverride();
  if (stand) return stand.reclaim();
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'reclaimSrpCallable', { corporationId, accessToken });
}

/**
 * Any member files an SRP Claim for their own loss. Sends a pasted zKillboard or ESI link; the
 * server fetches the killmail, checks it and prices the claim. The server fails with a
 * `details.reason` (not-your-loss, loss-in-other-corp, outside-window, already-claimed,
 * not-covered, fleet-or-fc-required, note-required, hash-unavailable, srp-off, ...).
 */
export async function fileSrpClaim(
  characterId: number,
  corporationId: number,
  claim: FileSrpClaimInput
): Promise<FiledSrpClaim> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'fileSrpClaimCallable', { corporationId, accessToken, ...claim });
}
