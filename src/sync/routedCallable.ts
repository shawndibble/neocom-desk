/**
 * Calls a backend callable through its group's router. The backend serves the
 * community, Corp Tax Book and device/Alerts Grant callables from one deployed function each
 * (`communityCall`, `corpTaxBookCall`, `alertsCall`; functions/src/callableRouter.ts), so a
 * deploy stays under Cloud Functions' per-minute mutation quota. `name` is the
 * callable's own name; `data` is what that callable takes.
 */
import { httpsCallable } from 'firebase/functions';
import { addFailureTag } from '@/observability/reportFailure';
import { getSyncFunctions } from './firebaseApp';

const ALERTS_CALLABLES = new Set(['registerDevice', 'saveAlertGrant', 'deleteAlertGrant']);

export function routerFor(name: string): 'communityCall' | 'corpTaxBookCall' | 'alertsCall' {
  if (ALERTS_CALLABLES.has(name)) return 'alertsCall';
  if (name.includes('CorpTaxBook') || name === 'verifyCorpOfficerCallable')
    return 'corpTaxBookCall';
  if (name.includes('Communit')) return 'communityCall';
  throw new Error(`No callable router for ${name}`);
}

export async function callRouted<In, Out>(name: string, data: In): Promise<Out> {
  try {
    const result = await httpsCallable<{ action: string; data: In }, Out>(
      getSyncFunctions(),
      routerFor(name)
    )({ action: name, data });
    return result.data;
  } catch (error) {
    // Every callable shares a router, so the error alone only says "internal".
    addFailureTag(error, { callable: name });
    throw error;
  }
}
