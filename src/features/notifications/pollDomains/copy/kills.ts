import type { ShipLostFire } from '@/engine/notificationDiffs';
import i18n from '@/i18n';
import { shipLostText, type ShipLostNames } from '../../serverEventCopy';
import type { DomainCopy } from './shared';

export type { ShipLostNames };

export const shipLostCopy: DomainCopy<ShipLostFire, ShipLostNames> = {
  // Shared with the service worker, which renders a server-pushed loss (issue #5121).
  poll: (fire, _character, names) => shipLostText((key, vars) => i18n.t(key, vars), fire, names),
};
