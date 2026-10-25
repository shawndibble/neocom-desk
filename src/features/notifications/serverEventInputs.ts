/**
 * The live `serverInputsFor` (issue #5121): what the server needs, per
 * Character, to push the polled server events. Read from the same places the
 * Foreground Poller reads them, so the server diffs the same targets at the
 * same hub against the same minimum: the Quickbar's price targets and the
 * Trade Hub it prices at (`pollDomains/priceAlerts.ts`), and the ship-lost
 * minimum ISK threshold. The community events need nothing.
 */
import { currentHub, targetedQuickbarItems } from './pollDomains/priceAlerts';
import { currentThresholds } from './pollDomains/shared';
import type { ServerEventInputs, ServerPushedEventId } from './serverEvents';

export async function readServerInputs(
  characterId: number,
  events: readonly ServerPushedEventId[]
): Promise<ServerEventInputs> {
  const inputs: ServerEventInputs = {};
  if (events.includes('priceAlertTriggered')) {
    const targeted = await targetedQuickbarItems(characterId);
    if (targeted.length > 0) {
      inputs.priceStationId = (await currentHub()).stationId;
      inputs.priceAlerts = targeted.map((item) => ({
        typeId: item.typeId,
        name: item.name,
        targetPrice: item.targetPrice,
        direction: item.targetDirection,
      }));
    }
  }
  if (events.includes('shipLost')) {
    inputs.shipLostMinimumIsk = (await currentThresholds(characterId)).shipLostMinimumIsk;
  }
  return inputs;
}
