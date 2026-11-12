import type { VettingSharedFire } from '@/engine/vettingAlert';
import i18n from '@/i18n';
import { vettingSharedText } from '../../serverEventCopy';
import type { DomainCopy, NoNames } from './shared';

// The wording is the service worker's too: it renders the fire when the backend pushes it.
const t = (key: string, vars?: Record<string, unknown>) => i18n.t(key, vars);

export const vettingSharedCopy: DomainCopy<VettingSharedFire, NoNames> = {
  poll: (fire) => vettingSharedText(t, fire),
};
