/**
 * Open in EVE: asks the Character's running EVE client to open a window — an
 * information window (character, corporation, alliance: the only targets ESI
 * documents; it 204s for a type but the client ignores it), a type's market,
 * or a contract. One ESI call, nothing in
 * the game changes. Which button or menu item sends it is `useOpenInEve`'s job.
 */
import { isOfflineFailure, isUnconfirmedWrite } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import {
  postOpenWindowContract,
  postOpenWindowInformation,
  postOpenWindowMarketDetails,
} from '@/esi/endpoints';
import type { EsiEndpointId } from '@/esi/registry';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';

export type OpenInEveKind = 'information' | 'marketDetails' | 'contract';

export interface OpenInEveTarget {
  kind: OpenInEveKind;
  /** An entity id for `information`, a type id for `marketDetails`, a contract id for `contract`. */
  id: number;
}

export type OpenInEveResult =
  | { ok: true }
  | {
      ok: false;
      /** ESI's own words, or `null` when it gave none. */
      message: string | null;
      /** ESI refused and the grant lacks the scope: a Grant fixes it. */
      needsPermission?: true;
      /** The request never reached ESI (offline, a timeout): nothing was refused. */
      offline?: true;
      /** The failure was a timeout after the request left: the window may have opened. */
      unconfirmed?: true;
    };

const ENDPOINT_IDS = {
  information: 'postOpenWindowInformation',
  marketDetails: 'postOpenWindowMarketDetails',
  contract: 'postOpenWindowContract',
} as const satisfies Record<OpenInEveKind, EsiEndpointId>;

/** Every endpoint Open in EVE can call — what a grant check has to cover. */
export const OPEN_IN_EVE_ENDPOINTS: readonly EsiEndpointId[] = Object.values(ENDPOINT_IDS);

function call(characterId: number, { kind, id }: OpenInEveTarget): Promise<unknown> {
  switch (kind) {
    case 'information':
      return postOpenWindowInformation(characterId, id);
    case 'marketDetails':
      return postOpenWindowMarketDetails(characterId, id);
    case 'contract':
      return postOpenWindowContract(characterId, id);
  }
}

export async function openInEve(
  characterId: number,
  target: OpenInEveTarget
): Promise<OpenInEveResult> {
  try {
    await call(characterId, target);
    return { ok: true };
  } catch (err) {
    if (isOfflineFailure(err)) {
      return isUnconfirmedWrite(err)
        ? { ok: false, message: null, offline: true, unconfirmed: true }
        : { ok: false, message: null, offline: true };
    }
    const outcome = await reportWriteAuthFailure(characterId, err, ENDPOINT_IDS[target.kind]);
    const message = err instanceof EsiError && err.message !== '' ? err.message : null;
    return outcome === 'grant-needed'
      ? { ok: false, message, needsPermission: true }
      : { ok: false, message };
  }
}
