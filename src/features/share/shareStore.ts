import { DAY_MS } from '@/lib/age';
import {
  connectFirestoreEmulator,
  doc,
  type Firestore,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore/lite';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { isOfflineFailure } from '@/esi/client';
import { generateShareId, isShareId } from '@/engine/share/shareId';
import { getFirebaseApp, getSyncFirestore } from '@/sync/firebaseApp';
import { emulatorsOn } from '@/sync/firebaseCore';
import { ensureAnySession } from '@/sync/syncAuth';

let anonymousEmulatorConnected = false;

export function shareFirestore(characterId?: number): Firestore {
  if (characterId !== undefined) return getSyncFirestore(characterId);
  const firestore = getFirestore(getFirebaseApp());
  if (emulatorsOn() && !anonymousEmulatorConnected) {
    anonymousEmulatorConnected = true;
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  }
  return firestore;
}

export const SHARES_COLLECTION = 'shares';
export const SHARE_TTL_MS = 7 * DAY_MS;

export const SHARE_TYPES = ['appraisal', 'fitting', 'dscan', 'survey', 'survey-start'] as const;
export type ShareType = (typeof SHARE_TYPES)[number];

export interface StoredShare {
  type: ShareType;
  payload: unknown;
  expiresAt: number;
}

export type LoadShareResult =
  | {
      ok: true;
      share: StoredShare;
      cachedAt?: number;
    }
  | { ok: false; reason: 'not-found' | 'unsupported' | 'failed' };

export function appUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${path}`;
}

export function shareUrl(id: string): string {
  return appUrl(`/s/${id}`);
}

export async function saveShare(input: {
  id: string;
  type: ShareType;
  payload: unknown;
  characterId?: number;
}): Promise<number> {
  if (input.characterId !== undefined) await ensureAnySession(input.characterId);
  const expiresAt = Date.now() + SHARE_TTL_MS;
  await setDoc(doc(shareFirestore(input.characterId), SHARES_COLLECTION, input.id), {
    type: input.type,
    payload: input.payload,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAt),
  });
  return expiresAt;
}

const REUSE_MARGIN_MS = DAY_MS;

const madeThisSession = new Map<string, { url: string; expiresAt: number }>();

function reuseSlot(type: ShareType, reuseKey: string): string {
  return `${type}\u0000${reuseKey}`;
}

export function existingShareLink(type: ShareType, reuseKey: string): string | null {
  const made = madeThisSession.get(reuseSlot(type, reuseKey));
  if (made === undefined || made.expiresAt - Date.now() < REUSE_MARGIN_MS) return null;
  return made.url;
}

export async function createShareLink(input: {
  type: ShareType;
  payload: unknown;
  reuseKey: string;
  characterId: number;
}): Promise<string> {
  const existing = existingShareLink(input.type, input.reuseKey);
  if (existing !== null) return existing;
  const id = generateShareId();
  const expiresAt = await saveShare({
    id,
    type: input.type,
    payload: input.payload,
    characterId: input.characterId,
  });
  const url = shareUrl(id);
  madeThisSession.set(reuseSlot(input.type, input.reuseKey), { url, expiresAt });
  return url;
}

export function resetShareLinksForTests(): void {
  madeThisSession.clear();
}

function isShareType(value: unknown): value is ShareType {
  return (SHARE_TYPES as readonly unknown[]).includes(value);
}

function shareCacheKey(id: string): string {
  return `share:${id}`;
}

function isUnreachable(error: unknown, code: unknown): boolean {
  return code === 'unavailable' || code === 'deadline-exceeded' || isOfflineFailure(error);
}

async function forgetShare(id: string): Promise<void> {
  try {
    await db.esiCache.delete([GLOBAL_CACHE_CHARACTER_ID, shareCacheKey(id)]);
  } catch {}
}

async function rememberShare(id: string, share: StoredShare): Promise<void> {
  if (share.type === 'survey') return;
  try {
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: shareCacheKey(id),
      value: share,
      fetchedAt: Date.now(),
    });
  } catch {}
}

async function recallShare(id: string): Promise<LoadShareResult | null> {
  try {
    const row = await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, shareCacheKey(id)]);
    if (row === undefined) return null;
    const share = row.value as StoredShare;
    if (!isShareType(share?.type) || !(share.expiresAt > Date.now())) {
      await forgetShare(id);
      return null;
    }
    return { ok: true, share, cachedAt: row.fetchedAt };
  } catch {
    return null;
  }
}

export async function loadShare(id: string): Promise<LoadShareResult> {
  if (!isShareId(id)) return { ok: false, reason: 'not-found' };
  let snapshot;
  try {
    snapshot = await getDoc(doc(shareFirestore(), SHARES_COLLECTION, id));
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'permission-denied') {
      await forgetShare(id);
      return { ok: false, reason: 'not-found' };
    }
    if (isUnreachable(error, code))
      return (await recallShare(id)) ?? { ok: false, reason: 'failed' };
    return { ok: false, reason: 'failed' };
  }
  if (!snapshot.exists()) {
    await forgetShare(id);
    return { ok: false, reason: 'not-found' };
  }
  const data = snapshot.data();
  const expiresAt =
    data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : Number.NEGATIVE_INFINITY;
  if (expiresAt <= Date.now()) {
    await forgetShare(id);
    return { ok: false, reason: 'not-found' };
  }
  if (!isShareType(data.type)) return { ok: false, reason: 'unsupported' };
  const share: StoredShare = { type: data.type, payload: data.payload, expiresAt };
  void rememberShare(id, share);
  return { ok: true, share };
}
