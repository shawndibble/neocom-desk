/**
 * What a stored D-Scan **Share Link** holds (issue #2943): the raw scan text,
 * not the counts, so the recipient's view is rebuilt by the same parsing and
 * class mapping the live D-Scan view runs (`classifyPilotPaste`,
 * `bucketDscan`) and the two can never disagree.
 *
 * Pure: the Firestore read/write around it lives in `features/share`.
 */
import { classifyPilotPaste } from './parsePilotPaste';

export const DSCAN_SNAPSHOT_VERSION = 1;

/**
 * Far past any real scan (a busy one is a few hundred rows, ~60 characters
 * each) and well under Firestore's 1 MiB doc limit, so one link can't be an
 * abuse vector. `firestore.rules` enforces the same cap.
 */
export const MAX_DSCAN_SNAPSHOT_CHARS = 50_000;

export interface DscanSnapshot {
  v: typeof DSCAN_SNAPSHOT_VERSION;
  /** The scan as `classifyPilotPaste` normalised it. */
  text: string;
}

export type BuildDscanSnapshotResult =
  { ok: true; value: DscanSnapshot } | { ok: false; reason: 'not-dscan' | 'too-large' };

export function buildDscanSnapshot(text: string): BuildDscanSnapshotResult {
  const paste = classifyPilotPaste(text);
  if (paste?.kind !== 'dscan') return { ok: false, reason: 'not-dscan' };
  if (paste.text.length > MAX_DSCAN_SNAPSHOT_CHARS) return { ok: false, reason: 'too-large' };
  return { ok: true, value: { v: DSCAN_SNAPSHOT_VERSION, text: paste.text } };
}

/** The scan a stored payload holds, or null when it is malformed, oversized or not a D-Scan. */
export function parseDscanSnapshot(payload: unknown): { text: string; typeIds: number[] } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { v, text } = payload as { v?: unknown; text?: unknown };
  if (v !== DSCAN_SNAPSHOT_VERSION || typeof text !== 'string') return null;
  if (text.length > MAX_DSCAN_SNAPSHOT_CHARS) return null;
  const paste = classifyPilotPaste(text);
  return paste?.kind === 'dscan' ? { text: paste.text, typeIds: paste.typeIds } : null;
}

export function dscanSnapshotReuseKey(snapshot: DscanSnapshot): string {
  return snapshot.text;
}
