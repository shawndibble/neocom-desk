/**
 * The wording of the server-pushed events (issue #5121), written once for both
 * places that render it: the Foreground Poller's copy tables
 * (`pollDomains/copy/{communities,priceAlerts,kills}.ts`, through the app's
 * i18next) and the service worker (`pushHandler.ts`, through its own small
 * i18next instance over the same `notifications` strings). The renderers take
 * the translate function rather than importing `@/i18n`, which would pull
 * every locale string and React into `sw.mjs`.
 */
import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from '@/engine/communities/communityAlert';
import type { NotificationCopy } from '@/engine/notificationWording';
import type {
  MailNotificationFire,
  PriceAlertTriggeredFire,
  ShipLostFire,
} from '@/engine/notificationDiffs';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import type { Translate } from '@/lib/translate';

export type { Translate } from '@/lib/translate';

/**
 * The fire a server push of `newMail` carries (issue #5143): the poller's own
 * fire plus what the push may name. Only the closed-app pop-up is worded from
 * them; the open app's diff does not carry them, so its copy stays the plain one.
 */
export interface NewMailPushFire extends MailNotificationFire {
  /** The header's `from`: a character, or a mailing list the name lookup cannot resolve. */
  fromId?: number;
  subject?: string;
}

export interface NewMailNames {
  readonly sender?: string;
}

export interface ShipLostNames {
  readonly ship?: string;
  readonly system?: string;
}

const fired = (t: Translate, eventId: string, variant: string, vars?: Record<string, unknown>) =>
  t(`notifications.fired.${eventId}.${variant}`, vars);

export function communityJoinRequestText(
  t: Translate,
  fire: CommunityJoinRequestFire
): NotificationCopy {
  return {
    title: fired(t, 'communityJoinRequest', 'title', { community: fire.communityName }),
    body: fired(t, 'communityJoinRequest', 'body', {
      name: fire.characterName,
      community: fire.communityName,
    }),
  };
}

export function communityMemberJoinedText(
  t: Translate,
  fire: CommunityMemberJoinedFire
): NotificationCopy {
  return {
    title: fired(t, 'communityMemberJoined', 'title', { community: fire.communityName }),
    body: fired(t, 'communityMemberJoined', 'body', {
      name: fire.characterName,
      community: fire.communityName,
    }),
  };
}

export function communityRequestPledgedText(
  t: Translate,
  fire: CommunityRequestPledgedFire
): NotificationCopy {
  const name = fire.characterName || fired(t, 'communityRequestPledged', 'someone');
  return {
    title: fired(t, 'communityRequestPledged', 'title', { community: fire.communityName }),
    body: fired(t, 'communityRequestPledged', 'body', {
      count: fire.count,
      name,
      community: fire.communityName,
      request: fire.requestLabel,
    }),
  };
}

/** The only event with no Character in its copy: an alert is per item, not per pilot. */
export function priceAlertText(t: Translate, fire: PriceAlertTriggeredFire): NotificationCopy {
  return {
    title: fired(t, 'priceAlertTriggered', 'title'),
    body: fired(t, 'priceAlertTriggered', `${fire.direction}Body`, {
      item: fire.name,
      price: formatIsk(fire.price, 2),
      target: formatIsk(fire.targetPrice, 2),
    }),
  };
}

/**
 * "{{character}} has new mail." — and, when the fire names them, from whom and
 * about what (a sender the lookup could not name is left out, not guessed).
 * The plain form (no sender, no subject) is what the Foreground Poller shows and
 * what a pushed feed row keeps, so no mail content is ever written to the
 * synced Notification Feed.
 */
export function newMailText(
  t: Translate,
  fire: Pick<NewMailPushFire, 'subject'>,
  character: string,
  names: NewMailNames = {}
): NotificationCopy {
  const subject = fire.subject?.trim() || undefined;
  const { sender } = names;
  const variant =
    sender !== undefined && subject !== undefined
      ? 'bodyFromSubject'
      : sender !== undefined
        ? 'bodyFrom'
        : subject !== undefined
          ? 'bodySubject'
          : 'body';
  return {
    title: fired(t, 'newMail', 'title'),
    body: fired(t, 'newMail', variant, { character, sender, subject }),
  };
}

/** Reads "Lost your Rifter in Tama · 12.4M ISK"; a part the loss lacks is left out, not guessed. */
export function shipLostText(
  t: Translate,
  fire: ShipLostFire,
  names: ShipLostNames
): NotificationCopy {
  const ship = names.ship ?? (fire.shipTypeId === undefined ? undefined : `#${fire.shipTypeId}`);
  const system = names.system ?? (fire.systemId === undefined ? undefined : `#${fire.systemId}`);
  const lost =
    ship === undefined
      ? fired(t, 'shipLost', 'lostShipUnknown')
      : fired(t, 'shipLost', 'lostShip', { ship });
  const where = system === undefined ? lost : fired(t, 'shipLost', 'inSystem', { lost, system });
  return {
    title: fired(t, 'shipLost', 'title'),
    body:
      fire.value === undefined
        ? where
        : fired(t, 'shipLost', 'withValue', { where, value: formatIskCompact(fire.value) }),
  };
}
