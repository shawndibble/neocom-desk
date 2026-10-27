/**
 * Stored **Share Links**: a short `/s/<id>` URL whose content lives in the
 * top-level Firestore `shares` collection for a week, instead of being packed
 * into the URL. One collection for every share type — the doc's `type` says
 * which page opens it (`routes/SharedLink.tsx`), so a new shareable page adds
 * a type, not a collection or a route.
 *
 * Writing needs a Firebase session (any signed-in Character — the Share
 * button only exists inside the app); reading does not, since whoever was
 * sent the link may have no account at all. `firestore.rules` grants a public
 * `get` by id, never `list`, and refuses an expired doc; the doc carries no
 * uid or Character id, because anyone holding the link can read all of it (a
 * Survey alone names its owner by Character name, in its payload).
 * Expired docs are deleted by a Firestore TTL policy on `expiresAt`
 * (`firestore.indexes.json`), which can lag a day — so the read checks expiry
 * itself as well.
 */
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

/**
 * The Firestore for a read or write the rules allow without sign-in (a share
 * `get`, a survey scan): the Character's session when one is given, else the
 * default app, which holds no session (issue #5074).
 */
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
export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Every page a Share Link can open. Mirrored by the `type in [...]` check in `firestore.rules`. */
export const SHARE_TYPES = ['appraisal', 'fitting', 'dscan', 'survey'] as const;
export type ShareType = (typeof SHARE_TYPES)[number];

export interface StoredShare {
  type: ShareType;
  /** Validated by the type's own page, not here — the rules only bound its size. */
  payload: unknown;
  /** Epoch millis. */
  expiresAt: number;
}

export type LoadShareResult =
  | {
      ok: true;
      share: StoredShare;
      /**
       * Epoch millis this copy was saved on this device. Set only when Firestore
       * could not be reached and the copy kept from an earlier visit is served
       * instead: absent means the share was just read live.
       */
      cachedAt?: number;
    }
  | { ok: false; reason: 'not-found' | 'unsupported' | 'failed' };

export function shareUrl(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/s/${id}`;
}

export async function saveShare(input: {
  id: string;
  type: ShareType;
  payload: unknown;
  /** Signs in as this Character if no Firebase session exists yet. */
  characterId: number;
}): Promise<number> {
  await ensureAnySession(input.characterId);
  const expiresAt = Date.now() + SHARE_TTL_MS;
  await setDoc(doc(getSyncFirestore(input.characterId), SHARES_COLLECTION, input.id), {
    type: input.type,
    payload: input.payload,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAt),
  });
  /** Epoch millis the stored share expires at — exactly what was written. */
  return expiresAt;
}

/**
 * A link made this session is handed back for the same content rather than
 * minting a second doc — "same appraisal, same link". Past this close to
 * expiry it isn't worth handing out: a fresh one is made instead.
 */
const REUSE_MARGIN_MS = 24 * 60 * 60 * 1000;

const madeThisSession = new Map<string, { url: string; expiresAt: number }>();

function reuseSlot(type: ShareType, reuseKey: string): string {
  return `${type}\u0000${reuseKey}`;
}

/** This session's link for the same content, if one is still good — with no await, so a copy stays inside the click. */
export function existingShareLink(type: ShareType, reuseKey: string): string | null {
  const made = madeThisSession.get(reuseSlot(type, reuseKey));
  if (made === undefined || made.expiresAt - Date.now() < REUSE_MARGIN_MS) return null;
  return made.url;
}

/**
 * Stores a share under a fresh id and returns its URL, or hands back this
 * session's link for the same `reuseKey` (the content itself, serialised: an
 * unchanged appraisal, an unchanged Fitting Share Code).
 */
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

/** Tests only: forget every link made this session. */
export function resetShareLinksForTests(): void {
  madeThisSession.clear();
}

function isShareType(value: unknown): value is ShareType {
  return (SHARE_TYPES as readonly unknown[]).includes(value);
}

/**
 * A loaded share is kept in `esiCache` under the sentinel Character (a share
 * is public, owned by nobody) until its own `expiresAt`, so a link opened once
 * still opens with no connection. Most types are written once under a fresh
 * id, so the copy is only a fallback: a live read always wins and replaces it.
 * A Survey is the exception: it is rewritten under its id and its scans live in
 * subcollections this payload does not carry, so it is never kept. The daily
 * `esiCache` prune drops what is left past `PRUNE_RULES`' `share:` window;
 * expiry itself is enforced here, on read.
 */
function shareCacheKey(id: string): string {
  return `share:${id}`;
}

/** Firestore's own offline codes, or a raw network failure. */
function isUnreachable(error: unknown, code: unknown): boolean {
  return code === 'unavailable' || code === 'deadline-exceeded' || isOfflineFailure(error);
}

async function forgetShare(id: string): Promise<void> {
  try {
    await db.esiCache.delete([GLOBAL_CACHE_CHARACTER_ID, shareCacheKey(id)]);
  } catch {
    // Best effort: a row that stays is dropped by the next read past its expiry.
  }
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
  } catch {
    // Quota or a blocked store: the live read already succeeded; only the offline copy is lost.
  }
}

/** The kept copy while it is unexpired; an expired one is purged here. */
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
    // The rules refuse an expired doc, and refuse a missing one too (their
    // expiry check has no `resource` to read) — both are "this link is gone".
    const code = (error as { code?: unknown }).code;
    if (code === 'permission-denied') {
      await forgetShare(id);
      return { ok: false, reason: 'not-found' };
    }
    // Only a link that could not be reached falls back to the saved copy; any
    // other failure is not evidence the share is still there.
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
  // Not awaited: it cannot throw, and the visitor should not wait on a disk write.
  void rememberShare(id, share);
  return { ok: true, share };
}
