/**
 * An officer's read of the corporation's open SRP Claims (issue #4855, ADR 0026), straight from
 * Firestore under the officer rules. Firestore here is the `lite` build (no listeners).
 */
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import type { SrpClaimState } from './srpTypes';

const STATES: readonly SrpClaimState[] = ['pending', 'approved', 'paid', 'rejected'];

/**
 * The fields of a claim doc the widgets read. Narrow on purpose: the doc carries more
 * (basis, note, hash...) and a field a later writer adds is simply ignored here.
 */
export interface SrpClaimRow {
  killmailId: number;
  state: SrpClaimState;
  /** Whole ISK; null while an officer has yet to type it. */
  amount: number | null;
  characterName: string | null;
  hullTypeId: number | null;
  solarSystemId: number | null;
  /** Epoch ms the claim was filed; 0 when the doc carries none. */
  filedAt: number;
}

const OPEN_STATES: SrpClaimState[] = ['pending', 'approved'];
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Reduces one claim doc; null for a doc with no usable killmail id or state. */
export function toClaimRow(id: string, data: Record<string, unknown>): SrpClaimRow | null {
  const killmailId = num(data.killmailId) ?? (Number.isInteger(Number(id)) ? Number(id) : null);
  const state = data.state;
  if (killmailId === null || !(STATES as readonly unknown[]).includes(state)) return null;
  return {
    killmailId,
    state: state as SrpClaimState,
    amount: num(data.amount),
    characterName: text(data.characterName),
    hullTypeId: num(data.hullTypeId),
    solarSystemId: num(data.solarSystemId),
    filedAt: num(data.filedAt) ?? 0,
  };
}

/** The Pending and Approved claims: what still needs an officer. Needs a live officer record. */
export async function readOpenSrpClaims(
  characterId: number,
  corporationId: number
): Promise<SrpClaimRow[]> {
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(
      collection(getSyncFirestore(), 'corps', String(corporationId), 'srpClaims'),
      where('state', 'in', OPEN_STATES)
    )
  );
  return snap.docs.flatMap((d) => {
    const row = toClaimRow(d.id, d.data());
    return row === null ? [] : [row];
  });
}
