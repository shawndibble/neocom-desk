import { classifyPilotPaste, type DscanRow } from './parsePilotPaste';

export const DSCAN_SNAPSHOT_VERSION = 1;

export const MAX_DSCAN_SNAPSHOT_CHARS = 50_000;

export interface DscanSnapshot {
  v: typeof DSCAN_SNAPSHOT_VERSION;
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

export function parseDscanSnapshot(
  payload: unknown
): { text: string; typeIds: number[]; rows: DscanRow[] } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { v, text } = payload as { v?: unknown; text?: unknown };
  if (v !== DSCAN_SNAPSHOT_VERSION || typeof text !== 'string') return null;
  if (text.length > MAX_DSCAN_SNAPSHOT_CHARS) return null;
  const paste = classifyPilotPaste(text);
  return paste?.kind === 'dscan'
    ? { text: paste.text, typeIds: paste.typeIds, rows: paste.rows }
    : null;
}

export function dscanSnapshotReuseKey(snapshot: DscanSnapshot): string {
  return snapshot.text;
}
