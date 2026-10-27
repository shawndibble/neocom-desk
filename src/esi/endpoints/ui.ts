import { esiFetch } from '../client';
import type { EsiResult } from '../client';

// --- POST /ui/autopilot/waypoint (esi-ui.write_waypoint.v1) ---

/**
 * Sets one autopilot waypoint in the Character's EVE client — Route Safety's
 * Set waypoints in game (issue #2479). `destinationId` is a solar system,
 * station or structure id. ESI answers 204 with no body. Both flags are
 * required query parameters, so both are always sent, `false` included.
 */
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

// --- POST /ui/openwindow/information (esi-ui.open_window.v1) ---

/**
 * Opens the EVE client's information window on a character, corporation or
 * alliance (Open in EVE). ESI documents nothing else: it answers 204 for an
 * inventory type too, but the client ignores it — use market details for those.
 * ESI answers 204 with no body; nothing in the game changes.
 */
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

// --- POST /ui/openwindow/marketdetails (esi-ui.open_window.v1) ---

/** Opens the EVE client's market window on an inventory type. */
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

// --- POST /ui/openwindow/contract (esi-ui.open_window.v1) ---

/**
 * Opens a contract in the EVE client. ESI refuses a contract the Character
 * can't see in game.
 */
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

// --- POST /ui/openwindow/newmail (esi-ui.open_window.v1) ---

/**
 * Opens the EVE client's new-mail window addressed to one character, with the
 * subject and body filled in; nothing is sent until the pilot presses Send in
 * game. The same scope as the other open-window calls, not the mail scopes,
 * and it is not a send, so it counts against no mail cap.
 */
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
