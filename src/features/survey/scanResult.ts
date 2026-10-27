/**
 * How adding a Survey Scan can end, in one place: the store throws
 * `ScanRejected` for text it won't store, and the two screens that add scans
 * turn any error into an `AddScanResult` for the board with `scanFailure`.
 */
import { parseSurveyScan } from '@/engine/survey/parseScan';

/** Mirrored by the size check in `firestore.rules`. */
export const MAX_SCAN_TEXT = 40_000;

/** Text the app won't store, decided before anything is sent. */
export type ScanRejection = 'not-a-scan' | 'too-large';
/** `refused`: the server answered permission-denied, e.g. its rules don't allow surveys yet. */
export type AddScanFailure = ScanRejection | 'refused' | 'failed';
export type AddScanResult = 'ok' | AddScanFailure;

export class ScanRejected extends Error {
  constructor(readonly reason: ScanRejection) {
    super(reason);
  }
}

export function scanFailure(error: unknown): AddScanFailure {
  if (error instanceof ScanRejected) return error.reason;
  return (error as { code?: unknown } | null)?.code === 'permission-denied' ? 'refused' : 'failed';
}

/**
 * Why this text can't be stored as a Survey Scan, or null when it can. Checked
 * before anything is sent, so pasting the wrong thing never starts a survey.
 */
export function rejectScanText(text: string): ScanRejection | null {
  if (parseSurveyScan(text) === null) return 'not-a-scan';
  return text.length > MAX_SCAN_TEXT ? 'too-large' : null;
}
