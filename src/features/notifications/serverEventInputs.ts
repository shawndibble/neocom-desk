/**
 * The live `serverInputsFor` (issue #5121): what the server needs, per
 * Character, to push the polled server events. Read from the same places the
 * Foreground Poller reads them, so the server diffs the same targets at the
 * same hub against the same minimum: the Quickbar's price targets and the
 * Trade Hub it prices at (`pollDomains/priceAlerts.ts`), and the ship-lost
 * minimum ISK threshold, and each nearby alert's jump limit (issue #5122). The
 * community events need nothing.
 */
import { currentHub, targetedQuickbarItems } from './pollDomains/priceAlerts';
import { currentThresholds } from './pollDomains/shared';
import type { ServerEventInputs, ServerPushedEventId } from './serverEvents';

/** The server's bounds (`functions/src/serverEvents.ts`); it drops what exceeds them. */
const MAX_PRICE_ALERTS = 100;
const MAX_NAME_LENGTH = 200;

export async function readServerInputs(
  characterId: number,
  events: readonly ServerPushedEventId[]
): Promise<ServerEventInputs> {
  const inputs: ServerEventInputs = {};
  if (events.includes('priceAlertTriggered')) {
    const targeted = (await targetedQuickbarItems(characterId))
      .filter((item) => Number.isFinite(item.targetPrice) && item.targetPrice >= 0)
      .slice(0, MAX_PRICE_ALERTS);
    if (targeted.length > 0) {
      inputs.priceStationId = (await currentHub()).stationId;
      inputs.priceAlerts = targeted.map((item) => ({
        typeId: item.typeId,
        name: item.name.slice(0, MAX_NAME_LENGTH),
        targetPrice: item.targetPrice,
        direction: item.targetDirection,
      }));
    }
  }
  if (events.includes('shipLost')) {
    inputs.shipLostMinimumIsk = (await currentThresholds(characterId)).shipLostMinimumIsk;
  }
  // The N the server counts nearby alerts within (issue #5122).
  if (events.includes('incursionNearby')) {
    inputs.incursionNearbyJumps = (await currentThresholds(characterId)).incursionNearbyJumps;
  }
  if (events.includes('skyhookRaidableNearby')) {
    inputs.skyhookRaidableNearbyJumps = (
      await currentThresholds(characterId)
    ).skyhookRaidableNearbyJumps;
  }
  return inputs;
}
