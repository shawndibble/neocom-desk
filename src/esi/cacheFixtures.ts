import { STALE_AFTER } from './cache';
import { MINUTE_MS } from '@/lib/age';

export const STALE_FETCHED_AT = Date.now() - STALE_AFTER.default - MINUTE_MS;
