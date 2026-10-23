import type { ShipLostFire } from '@/engine/notificationDiffs';
import { formatIskCompact } from '@/lib/isk';
import { type DomainCopy, fired } from './shared';

export interface ShipLostNames {
  readonly ship?: string;
  readonly system?: string;
}

export const shipLostCopy: DomainCopy<ShipLostFire, ShipLostNames> = {
  // Reads "Lost your Rifter in Tama · 12.4M ISK"; a part the loss lacks is left out, not guessed.
  poll: (fire, _character, names) => {
    const ship = names.ship ?? (fire.shipTypeId === undefined ? undefined : `#${fire.shipTypeId}`);
    const system = names.system ?? (fire.systemId === undefined ? undefined : `#${fire.systemId}`);
    const lost =
      ship === undefined
        ? fired('shipLost', 'lostShipUnknown')
        : fired('shipLost', 'lostShip', { ship });
    const where = system === undefined ? lost : fired('shipLost', 'inSystem', { lost, system });
    return {
      title: fired('shipLost', 'title'),
      body:
        fire.value === undefined
          ? where
          : fired('shipLost', 'withValue', { where, value: formatIskCompact(fire.value) }),
    };
  },
};
