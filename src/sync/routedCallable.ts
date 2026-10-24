/**
 * Calls a backend callable through its group's router. The backend serves the
 * community, Corp Tax Book and device/Alerts Grant callables from one deployed function each
 * (`communityCall`, `corpTaxBookCall`, `alertsCall`; functions/src/callableRouter.ts), so a
 * deploy stays under Cloud Functions' per-minute mutation quota. `name` is the
 * callable's own name, one of the action names in functions/src/callableManifest.ts, which also
 * decides the router (the server registers each action under the same group); `data` is what that callable takes.
 */
import { httpsCallable } from 'firebase/functions';
import { addFailureTag } from '@/observability/reportFailure';
import {
  groupOf,
  ROUTER_FUNCTIONS,
  type CallableAction,
  type CallableGroup,
} from '../../functions/src/callableManifest';
import { getSyncFunctions } from './firebaseApp';

export function routerFor(name: string): (typeof ROUTER_FUNCTIONS)[CallableGroup] {
  const group = groupOf(name);
  if (!group) throw new Error(`No callable router for ${name}`);
  return ROUTER_FUNCTIONS[group];
}

export async function callRouted<In, Out>(name: CallableAction, data: In): Promise<Out> {
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
