import { currentHub, targetedQuickbarItems } from './pollDomains/priceAlerts';
import { currentThresholds } from './pollDomains/shared';
import type { ServerEventInputs, ServerPushedEventId } from './serverEvents';

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
      inputs.priceStationId = (await currentHub(characterId)).stationId;
      inputs.priceAlerts = targeted.map((item) => ({
        typeId: item.typeId,
        name: item.name.slice(0, MAX_NAME_LENGTH),
        targetPrice: item.targetPrice,
        direction: item.targetDirection,
      }));
    }
  }
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
