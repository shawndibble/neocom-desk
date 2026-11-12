/**
 * What "Finish setting up" shows on arriving at a page (issue #6103): a fresh
 * offer worked out from what the device knows, or the running chain with EVE's
 * return (router state) recorded against its current approval.
 */
import {
  currentApproval,
  recordApproval,
  startFinishSetup,
  type ApprovalResult,
  type FinishSetupChain,
} from '@/engine/character/finishSetup';
import type { OwnCorpGrantCallbackState } from '@/features/corp/taxBook/ownCorpGrant';
import { alertsReturnFor, type AlertsCallbackState } from '@/features/notifications/alertsGrant';
import { clearFinishSetup, readFinishSetup, saveFinishSetupChain } from './finishSetupStore';
import { loadStillToApprove } from './loadStillToApprove';

export type ArrivalState = Partial<OwnCorpGrantCallbackState & AlertsCallbackState> | null;

/** What EVE's return says about the chain's current approval; null when it is about something else. */
export function arrivalResult(chain: FinishSetupChain, state: ArrivalState): ApprovalResult | null {
  const cur = currentApproval(chain);
  if (!cur || !state) return null;
  const moon = state.ownCorpGrant;
  if (cur.kind === 'moon' && moon && moon.corporationId === cur.corporationId) {
    switch (moon.status) {
      case 'connected':
        return { kind: 'moon', result: 'done' };
      case 'wrong-character':
        return { kind: 'moon', result: 'wrong-character', signedInAs: moon.signedInAs };
      case 'refused':
        return moon.reason === 'already-feeder'
          ? { kind: 'moon', result: 'done' }
          : { kind: 'moon', result: 'refused', reason: moon.reason };
      case 'cancelled':
        return { kind: 'moon', result: 'not-done' };
    }
  }
  const alerts = state.alertsGrant && alertsReturnFor(state.alertsGrant, chain.characterId);
  if (cur.kind === 'alerts' && alerts) {
    if (alerts.kind === 'wrong-character') {
      return { kind: 'alerts', result: 'wrong-character', signedInAs: alerts.signedInAs };
    }
    return { kind: 'alerts', result: alerts.kind === 'on' ? 'done' : 'not-done' };
  }
  return null;
}

export type FinishSetupView = { offering: boolean; chain: FinishSetupChain };

let lastOffer: { offeredAt: number | undefined; view: FinishSetupView } | null = null;

/** The step to show here, or null for none (an empty offer is cleared). */
export async function finishSetupViewOnArrival(
  state: ArrivalState
): Promise<FinishSetupView | null> {
  const saved = readFinishSetup();
  if (saved?.stage !== 'offer') lastOffer = null;
  if (!saved) return null;
  if (saved.stage === 'running') {
    const result = arrivalResult(saved.chain, state);
    const chain = result ? recordApproval(saved.chain, result) : saved.chain;
    if (chain !== saved.chain) saveFinishSetupChain(chain);
    return { offering: false, chain };
  }
  const { characterId } = saved;
  // Worked out once per offer, not on every navigation while it is on screen (an ESI read).
  if (lastOffer && lastOffer.offeredAt === saved.offeredAt) return lastOffer.view;
  const found = await loadStillToApprove(characterId).catch(() => null);
  if (!found || found.items.length === 0) {
    clearFinishSetup();
    return null;
  }
  const view = { offering: true, chain: startFinishSetup({ characterId, ...found }) };
  lastOffer = { offeredAt: saved.offeredAt, view };
  return view;
}
