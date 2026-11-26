import type { ZkillFailureReason } from '@/lib/zkillboard';

const OFFLINE_KEY = 'travel.zkillFailure.offline';
const RATE_LIMITED_KEY = 'travel.zkillFailure.rateLimited';

export function zkillFailureKey<K extends string>(
  reason: ZkillFailureReason | undefined,
  fallbackKey: K
): K | typeof OFFLINE_KEY | typeof RATE_LIMITED_KEY {
  if (reason === 'offline') return OFFLINE_KEY;
  if (reason === 'rate-limited') return RATE_LIMITED_KEY;
  return fallbackKey;
}
