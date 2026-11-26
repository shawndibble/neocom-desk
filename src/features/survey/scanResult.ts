import { parseSurveyScan } from '@/engine/survey/parseScan';

export const MAX_SCAN_TEXT = 40_000;

export type ScanRejection = 'not-a-scan' | 'too-large';
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

export function rejectScanText(text: string): ScanRejection | null {
  if (parseSurveyScan(text) === null) return 'not-a-scan';
  return text.length > MAX_SCAN_TEXT ? 'too-large' : null;
}
