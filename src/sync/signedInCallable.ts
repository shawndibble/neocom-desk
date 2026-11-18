import type { CallableAction } from '../../functions/src/callableManifest';
import { callRouted } from './routedCallable';
import { ensureSignedIn } from './syncAuth';

/** One callable, signed in as `characterId` first; the Corp Tax Book, SRP and feeder clients share it. */
export async function callSignedIn<In, Out>(
  characterId: number,
  name: CallableAction,
  data: In
): Promise<Out> {
  await ensureSignedIn(characterId);
  return callRouted<In, Out>(name, data, characterId);
}
