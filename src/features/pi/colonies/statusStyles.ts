import type { CheckStatus } from './coloniesModel';

export const STATUS_TONE_CLASS: Record<CheckStatus, string> = {
  stopped: 'text-warning',
  expiring: 'text-warning',
  'needs-look': 'text-warning',
  unknown: 'text-text-dim',
  healthy: 'text-success',
};

export const STATUS_DOT_CLASS: Record<CheckStatus, string> = {
  stopped: 'bg-warning',
  expiring: 'bg-warning',
  'needs-look': 'bg-warning',
  unknown: 'bg-text-dim',
  healthy: 'bg-success',
};
