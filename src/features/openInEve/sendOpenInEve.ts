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
  id: number;
}

export type OpenInEveResult =
  | { ok: true }
  | {
      ok: false;
      message: string | null;
      needsPermission?: true;
      offline?: true;
      unconfirmed?: true;
    };

const ENDPOINT_IDS = {
  information: 'postOpenWindowInformation',
  marketDetails: 'postOpenWindowMarketDetails',
  contract: 'postOpenWindowContract',
} as const satisfies Record<OpenInEveKind, EsiEndpointId>;

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
