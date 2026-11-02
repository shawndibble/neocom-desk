/**
 * The polled-domain registry (issue #273): one entry per data domain the
 * Foreground Poller fetches — what it loads, how that becomes a snapshot, and
 * where the last snapshot is kept. `foregroundPoller.ts` is one generic loop
 * over `POLL_DOMAINS`.
 *
 * A domain is a *fetch*, not an event: several Notification Events can read
 * one snapshot (calendar's two, contracts' three). What each event does with
 * it — its diff, copy, projectability and thresholds — is declared once, on
 * its Event Entry (`eventEntries.ts`, issue #1285). A domain names its
 * snapshot through a `SnapshotSource` handle, and its event list, diffs and
 * live renderer are derived from the entries naming the same handle. So a
 * new event over an existing fetch is an entry there and nothing here; a new
 * fetch is a domain file here plus its entries.
 *
 * What stays per-domain is what needs the fetch's own context: the `names`
 * lookups its copy needs, the Scheduled Push `projection` runner (which
 * resolves names and current thresholds, then renders each row through its
 * event's entry), and planetary's `disproven` retraction. `defineDomain`
 * (`defineDomain.ts`) is where each domain's types are erased to `unknown`,
 * so the entry literal is fully type-checked while the loop that drives all
 * of them needs no per-domain branch. Each domain describes its persisted
 * snapshot's shape once, through `snapshotShape.ts`.
 *
 * Import this module only through this index; tests reach a single domain by
 * its own file.
 */
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

export type { AnyNotificationFire } from '../eventEntries';
export type { PollDomain } from './defineDomain';
export { lastPriceAlertSnapshot } from './priceAlerts';

/**
 * Every polled domain, in fetch order. One entry here is the whole cost of
 * adding a domain: `foregroundPoller.ts` names none of them.
 */
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
];

const DOMAIN_BY_EVENT: ReadonlyMap<NotificationEventId, PollDomain> = new Map(
  POLL_DOMAINS.flatMap((domain) => domain.eventIds.map((eventId) => [eventId, domain] as const))
);

/** The one domain whose diffs can fire this event. */
export function domainForEvent(eventId: NotificationEventId): PollDomain {
  const domain = DOMAIN_BY_EVENT.get(eventId);
  if (domain === undefined) throw new Error(`pollDomains: no domain fires ${eventId}`);
  return domain;
}

/** A fire's live copy, names looked up by its own domain. */
export function renderNotification(
  fire: AnyNotificationFire,
  characterName: string
): Promise<NotificationCopy> {
  return domainForEvent(fire.eventId).render(fire, characterName);
}

/** The row a fire was about, where its event has a use for one — see `NotificationFeedRecord.subjectId`. */
export function notificationSubjectId(fire: AnyNotificationFire): number | undefined {
  return eventEntry(fire.eventId).copy.subjectOf?.(fire);
}
