/**
 * A shared **Survey**: a `survey` Share Link (`shares/{id}`, same id, URL and
 * 7-day lifetime as every other stored Share Link) whose Survey Scans live in
 * a create-only subcollection, `shares/{id}/surveyScans`, one doc per paste.
 *
 * Anyone holding the link can add a scan and no sign-in is needed: the
 * visitor who keeps a Survey going after the pilot who started it has left
 * may have no account. Only starting one needs a Firebase session, as for any
 * other Share Link. A scan stores the pasted text (the same parser rebuilds
 * the rocks on every reader), the server's clock as its time, and the
 * survey's own expiry so the TTL policy deletes it with the survey.
 *
 * The moon tax (who gets it, at what rate) lives the same way, in a create-only
 * `surveyTax` subcollection: a share can't be rewritten, so each change is a new
 * doc and the newest one is the tax. Only a signed-in pilot can write one.
 */
import { addDoc, collection, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore/lite';
import { generateShareId } from '@/engine/share/shareId';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import type { SurveyScan } from '@/engine/survey/series';
import { loadShare, saveShare, shareUrl } from '@/features/share/shareStore';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { MAX_SCAN_TEXT, rejectScanText, ScanRejected } from './scanResult';

export { MAX_SCAN_TEXT };

export const SURVEY_SCANS_COLLECTION = 'surveyScans';
export const SURVEY_TAX_COLLECTION = 'surveyTax';

/** Who gets the moon tax on a Survey, and the rate (0 to 100). */
export interface SurveyTaxShare {
  name: string;
  pct: number;
}

export const MAX_TAX_NAME = 100;

export async function startSurvey(input: {
  characterId: number;
  /** The starting pilot's Character name, kept on the survey so they can be recognised as its owner. */
  ownerName: string;
}): Promise<{ id: string; url: string; expiresAt: number }> {
  const id = generateShareId();
  const expiresAt = await saveShare({
    id,
    type: 'survey',
    payload: { v: 1, owner: input.ownerName },
    characterId: input.characterId,
  });
  return { id, url: shareUrl(id), expiresAt };
}

export async function addSurveyScan(input: {
  id: string;
  text: string;
  /** The survey's own expiry, as `loadSurvey` or `startSurvey` returned it. */
  expiresAt: number;
}): Promise<void> {
  const rejected = rejectScanText(input.text);
  if (rejected !== null) throw new ScanRejected(rejected);
  await addDoc(collection(getSyncFirestore(), 'shares', input.id, SURVEY_SCANS_COLLECTION), {
    text: input.text,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(input.expiresAt),
  });
}

export async function setSurveyTax(input: {
  id: string;
  expiresAt: number;
  name: string;
  pct: number;
}): Promise<void> {
  await addDoc(collection(getSyncFirestore(), 'shares', input.id, SURVEY_TAX_COLLECTION), {
    name: input.name.slice(0, MAX_TAX_NAME),
    pct: input.pct,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(input.expiresAt),
  });
}

export type LoadSurveyResult =
  | {
      ok: true;
      scans: SurveyScan[];
      expiresAt: number;
      owner: string | null;
      tax: SurveyTaxShare | null;
    }
  | { ok: false; reason: 'not-found' | 'failed' };

/** The Character name a survey was started under; null for one stored before owners existed. */
function ownerOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { owner } = payload as { owner?: unknown };
  return typeof owner === 'string' && owner !== '' ? owner : null;
}

export async function loadSurvey(id: string): Promise<LoadSurveyResult> {
  const found = await loadShare(id);
  if (!found.ok) return { ok: false, reason: found.reason === 'failed' ? 'failed' : 'not-found' };
  if (found.share.type !== 'survey') return { ok: false, reason: 'not-found' };

  try {
    const snapshot = await getDocs(
      collection(getSyncFirestore(), 'shares', id, SURVEY_SCANS_COLLECTION)
    );
    const scans: SurveyScan[] = [];
    for (const d of snapshot.docs) {
      const data = d.data();
      const rocks = typeof data.text === 'string' ? parseSurveyScan(data.text) : null;
      if (rocks === null || !(data.createdAt instanceof Timestamp)) continue;
      scans.push({ at: data.createdAt.toMillis(), rocks });
    }
    scans.sort((a, b) => a.at - b.at);
    return {
      ok: true,
      scans,
      expiresAt: found.share.expiresAt,
      owner: ownerOf(found.share.payload),
      tax: await loadSurveyTax(id),
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** The newest tax stored on the survey, or null. A failed read is "none": the scans still load. */
async function loadSurveyTax(id: string): Promise<SurveyTaxShare | null> {
  try {
    const snapshot = await getDocs(
      collection(getSyncFirestore(), 'shares', id, SURVEY_TAX_COLLECTION)
    );
    let newest: { at: number; tax: SurveyTaxShare } | null = null;
    for (const d of snapshot.docs) {
      const data = d.data();
      if (typeof data.name !== 'string' || data.name.trim() === '') continue;
      if (typeof data.pct !== 'number' || !(data.pct >= 0 && data.pct <= 100)) continue;
      if (!(data.createdAt instanceof Timestamp)) continue;
      const at = data.createdAt.toMillis();
      if (newest === null || at > newest.at) {
        newest = { at, tax: { name: data.name.trim().slice(0, MAX_TAX_NAME), pct: data.pct } };
      }
    }
    return newest?.tax ?? null;
  } catch {
    return null;
  }
}
