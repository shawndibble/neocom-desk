import { esiFetch } from '../client';
import type { EsiResult } from '../client';

export function postAutopilotWaypoint(
  characterId: number,
  destinationId: number,
  { clearOtherWaypoints, signal }: { clearOtherWaypoints: boolean; signal?: AbortSignal }
): Promise<EsiResult<null>> {
  return esiFetch<null>('/ui/autopilot/waypoint', {
    signal,
    characterId,
    method: 'POST',
    query: {
      destination_id: destinationId,
      clear_other_waypoints: clearOtherWaypoints,
      add_to_beginning: false,
    },
    endpointId: 'postAutopilotWaypoint',
  });
}

export function postOpenWindowInformation(
  characterId: number,
  targetId: number,
  { signal }: { signal?: AbortSignal } = {}
): Promise<EsiResult<null>> {
  return esiFetch<null>('/ui/openwindow/information', {
    signal,
    characterId,
    method: 'POST',
    query: { target_id: targetId },
    endpointId: 'postOpenWindowInformation',
  });
}

export function postOpenWindowMarketDetails(
  characterId: number,
  typeId: number,
  { signal }: { signal?: AbortSignal } = {}
): Promise<EsiResult<null>> {
  return esiFetch<null>('/ui/openwindow/marketdetails', {
    signal,
    characterId,
    method: 'POST',
    query: { type_id: typeId },
    endpointId: 'postOpenWindowMarketDetails',
  });
}

export function postOpenWindowContract(
  characterId: number,
  contractId: number,
  { signal }: { signal?: AbortSignal } = {}
): Promise<EsiResult<null>> {
  return esiFetch<null>('/ui/openwindow/contract', {
    signal,
    characterId,
    method: 'POST',
    query: { contract_id: contractId },
    endpointId: 'postOpenWindowContract',
  });
}

export function postOpenWindowNewMail(
  characterId: number,
  draft: { recipientId: number; subject: string; body: string },
  { signal }: { signal?: AbortSignal } = {}
): Promise<EsiResult<null>> {
  return esiFetch<null>('/ui/openwindow/newmail', {
    signal,
    characterId,
    method: 'POST',
    body: { recipients: [draft.recipientId], subject: draft.subject, body: draft.body },
    endpointId: 'postOpenWindowNewMail',
  });
}
