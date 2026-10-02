/**
 * Stored **Share Links**: a short `/share/<id>` URL whose content lives in the
 * top-level Firestore `shares` collection for a week, instead of being packed
 * into the URL. One collection for every share type — the doc's `type` says
 * which page opens it (`routes/SharedLink.tsx`), so a new shareable page adds
 * a type, not a collection or a route.
 *
 * Writing needs a Firebase session (any signed-in Character — the Share
 * button only exists inside the app); reading does not, since whoever was
 * sent the link may have no account at all. `firestore.rules` grants a public
 * `get` by id, never `list`, and refuses an expired doc; the doc carries no
 * uid or Character id, because anyone holding the link can read all of it.
 * Expired docs are deleted by a Firestore TTL policy on `expiresAt`
 * (`firestore.indexes.json`), which can lag a day — so the read checks expiry
 * itself as well.
 */
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore/lite';
import { generateShareId, isShareId } from '@/engine/share/shareId';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureAnySession } from '@/sync/syncAuth';

export const SHARES_COLLECTION = 'shares';
export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Every page a Share Link can open. Mirrored by the `type in [...]` check in `firestore.rules`. */
export const SHARE_TYPES = ['appraisal', 'fitting'] as const;
export type ShareType = (typeof SHARE_TYPES)[number];

export interface StoredShare {
  type: ShareType;
  /** Validated by the type's own page, not here — the rules only bound its size. */
  payload: unknown;
  /** Epoch millis. */
  expiresAt: number;
}

export type LoadShareResult =
  { ok: true; share: StoredShare } | { ok: false; reason: 'not-found' | 'unsupported' | 'failed' };

export function shareUrl(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/share/${id}`;
}

export async function saveShare(input: {
  id: string;
  type: ShareType;
  payload: unknown;
  /** Signs in as this Character if no Firebase session exists yet. */
  characterId: number;
}): Promise<void> {
  await ensureAnySession(input.characterId);
  await setDoc(doc(getSyncFirestore(), SHARES_COLLECTION, input.id), {
    type: input.type,
    payload: input.payload,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + SHARE_TTL_MS),
  });
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
  const expiresAt = Date.now() + SHARE_TTL_MS;
  await saveShare({ id, type: input.type, payload: input.payload, characterId: input.characterId });
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

export async function loadShare(id: string): Promise<LoadShareResult> {
  if (!isShareId(id)) return { ok: false, reason: 'not-found' };
  let snapshot;
  try {
    snapshot = await getDoc(doc(getSyncFirestore(), SHARES_COLLECTION, id));
  } catch (error) {
    // The rules refuse an expired doc, and refuse a missing one too (their
    // expiry check has no `resource` to read) — both are "this link is gone".
    const code = (error as { code?: unknown }).code;
    return { ok: false, reason: code === 'permission-denied' ? 'not-found' : 'failed' };
  }
  if (!snapshot.exists()) return { ok: false, reason: 'not-found' };
  const data = snapshot.data();
  const expiresAt =
    data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : Number.NEGATIVE_INFINITY;
  if (expiresAt <= Date.now()) return { ok: false, reason: 'not-found' };
  if (!isShareType(data.type)) return { ok: false, reason: 'unsupported' };
  return { ok: true, share: { type: data.type, payload: data.payload, expiresAt } };
}
