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
import type { VettingSharedFire } from '@/engine/vettingAlert';
import type { CorpTaxBookSyncStoppedFire } from '@/engine/corpTaxBook/syncStoppedAlert';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import type { Translate } from '@/lib/translate';

export interface NewMailPushFire extends MailNotificationFire {
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

export function vettingSharedText(t: Translate, fire: VettingSharedFire): NotificationCopy {
  return {
    title: fired(t, 'vettingShared', 'title'),
    body: fired(t, 'vettingShared', fire.kind),
  };
}

export function corpTaxBookSyncStoppedText(
  t: Translate,
  fire: CorpTaxBookSyncStoppedFire
): NotificationCopy {
  const name = fire.characterName || fired(t, 'corpTaxBookSyncStopped', 'holder');
  return {
    title: fired(t, 'corpTaxBookSyncStopped', 'title'),
    body: fired(t, 'corpTaxBookSyncStopped', fire.reason, { name }),
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
