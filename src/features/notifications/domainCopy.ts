import type { CorpTaxBookSyncStoppedFire } from '@/engine/corpTaxBook/syncStoppedAlert';
import type { VettingSharedFire } from '@/engine/vettingAlert';
import i18n from '@/i18n';
import { corpTaxBookSyncStoppedText, vettingSharedText } from './serverEventCopy';
import type { DomainCopy, NoNames } from './pollDomains/copy/shared';

export type { DomainCopy, NoNames };
export * from './pollDomains/copy/skillQueue';
export * from './pollDomains/copy/spExtraction';
export * from './pollDomains/copy/cloneJump';
export * from './pollDomains/copy/industryJobs';
export * from './pollDomains/copy/colonies';
export * from './pollDomains/copy/mail';
export * from './pollDomains/copy/calendar';
export * from './pollDomains/copy/contracts';
export * from './pollDomains/copy/wallet';
export * from './pollDomains/copy/marketOrders';
export * from './pollDomains/copy/eveNotifications';
export * from './pollDomains/copy/corp';
export * from './pollDomains/copy/stockTargets';
export * from './pollDomains/copy/communities';
export * from './pollDomains/copy/incursions';
export * from './pollDomains/copy/skyhooks';
export * from './pollDomains/copy/priceAlerts';
export * from './pollDomains/copy/kills';
export * from './pollDomains/copy/signIn';
export * from './pollDomains/copy/dens';
export * from './pollDomains/copy/accelerator';
export * from './pollDomains/copy/acceleratorEnded';
export * from './pollDomains/copy/skyhooksNearby';
export * from './pollDomains/copy/sharedMoonPop';

const t = (key: string, vars?: Record<string, unknown>) => i18n.t(key, vars);

export const vettingSharedCopy: DomainCopy<VettingSharedFire, NoNames> = {
  poll: (fire) => vettingSharedText(t, fire),
};

export const corpTaxBookSyncStoppedCopy: DomainCopy<CorpTaxBookSyncStoppedFire, NoNames> = {
  poll: (fire) => corpTaxBookSyncStoppedText(t, fire),
};
