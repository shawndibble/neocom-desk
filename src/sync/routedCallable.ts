/**
 * Calls a backend callable through its group's router. The backend serves the
 * community and Corp Tax Book callables from one deployed function each
 * (`communityCall`, `corpTaxBookCall`; functions/src/callableRouter.ts), so a
 * deploy stays under Cloud Functions' per-minute mutation quota. `name` is the
 * callable's own name; `data` is what that callable takes.
 */
import { httpsCallable } from 'firebase/functions';
import { getSyncFunctions } from './firebaseApp';

export function routerFor(name: string): 'communityCall' | 'corpTaxBookCall' {
  if (name.includes('CorpTaxBook') || name === 'verifyCorpOfficerCallable')
    return 'corpTaxBookCall';
  if (name.includes('Communit')) return 'communityCall';
  throw new Error(`No callable router for ${name}`);
}

export async function callRouted<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<{ action: string; data: In }, Out>(
    getSyncFunctions(),
    routerFor(name)
  )({ action: name, data });
  return result.data;
}
