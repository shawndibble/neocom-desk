import type { NotificationCopy } from '@/engine/notificationWording';
import type { NotificationEventId } from '../events';
import { eventEntry, type AnyNotificationFire } from '../eventEntries';
import type { PollDomain } from './defineDomain';
import { skillQueueDomain } from './skillQueue';
import { spExtractionDomain } from './spExtraction';
import { industryJobDomain } from './industryJobs';
import { cloneJumpDomain } from './cloneJump';
import { colonyDomain } from './colonies';
import { mailDomain } from './mail';
import { calendarDomain } from './calendar';
import { contractDomain } from './contracts';
import { walletDomain } from './wallet';
import { marketOrderDomain, marketOrderUndercutDomain, orderExpiryDomain } from './marketOrders';
import { eveNotificationDomain } from './eveNotifications';
import {
  structureFuelDomain,
  skyhookDomain,
  corpIndustryJobDomain,
  corpRosterDomain,
  corpWalletDomain,
} from './corp';
import { priceAlertDomain } from './priceAlerts';
import { stockTargetDomain } from './stockTargets';
import { incursionDomain } from './incursions';
import { skyhookNearbyDomain } from './skyhooksNearby';
import { communitiesDomain } from './communities';
import { killsDomain } from './kills';
import { mercenaryDensDomain } from './mercenaryDens';
import { acceleratorDomain } from './accelerator';
import { acceleratorEndedDomain } from './acceleratorEnded';
import { sharedMoonPopDomain } from './sharedMoonPops';
import { signInDomain } from './signIn';

export type { AnyNotificationFire } from '../eventEntries';
export type { PollDomain } from './defineDomain';
export { lastPriceAlertSnapshot } from './priceAlerts';

export const POLL_DOMAINS: readonly PollDomain[] = [
  skillQueueDomain,
  spExtractionDomain,
  industryJobDomain,
  cloneJumpDomain,
  colonyDomain,
  mailDomain,
  calendarDomain,
  contractDomain,
  walletDomain,
  marketOrderDomain,
  marketOrderUndercutDomain,
  orderExpiryDomain,
  eveNotificationDomain,
  structureFuelDomain,
  skyhookDomain,
  corpIndustryJobDomain,
  corpRosterDomain,
  corpWalletDomain,
  priceAlertDomain,
  stockTargetDomain,
  incursionDomain,
  skyhookNearbyDomain,
  communitiesDomain,
  killsDomain,
  mercenaryDensDomain,
  acceleratorDomain,
  acceleratorEndedDomain,
  sharedMoonPopDomain,
  signInDomain,
];

const DOMAIN_BY_EVENT: ReadonlyMap<NotificationEventId, PollDomain> = new Map(
  POLL_DOMAINS.flatMap((domain) => domain.eventIds.map((eventId) => [eventId, domain] as const))
);

export function domainForEvent(eventId: NotificationEventId): PollDomain {
  const domain = DOMAIN_BY_EVENT.get(eventId);
  if (domain === undefined) throw new Error(`pollDomains: no domain fires ${eventId}`);
  return domain;
}

export function renderNotification(
  fire: AnyNotificationFire,
  characterName: string
): Promise<NotificationCopy> {
  const { source, copy } = eventEntry(fire.eventId);
  if (source === null) return Promise.resolve(copy.poll(fire, characterName, {}));
  return domainForEvent(fire.eventId).render(fire, characterName);
}

export function notificationSubjectId(fire: AnyNotificationFire): number | undefined {
  return eventEntry(fire.eventId).copy.subjectOf?.(fire);
}
