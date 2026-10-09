/**
 * How adding a Survey Scan can end, in one place: the store throws
 * `ScanRejected` for text it won't store, and the two screens that add scans
 * turn any error into an `AddScanResult` for the board with `scanFailure`.
 */
export type AddScanFailure = 'not-a-scan' | 'too-large' | 'failed';
export type AddScanResult = 'ok' | AddScanFailure;

export class ScanRejected extends Error {
  constructor(readonly reason: Exclude<AddScanFailure, 'failed'>) {
    super(reason);
  }
}

export function scanFailure(error: unknown): AddScanFailure {
  return error instanceof ScanRejected ? error.reason : 'failed';
}
