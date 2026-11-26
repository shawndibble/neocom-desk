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

export async function callRouted<In, Out>(
  name: CallableAction,
  data: In,
  characterId: number | undefined
): Promise<Out> {
  try {
    const result = await httpsCallable<{ action: string; data: In }, Out>(
      getSyncFunctions(characterId),
      routerFor(name)
    )({ action: name, data });
    return result.data;
  } catch (error) {
    addFailureTag(error, { callable: name });
    throw error;
  }
}
