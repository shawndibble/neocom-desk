import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';

export type ThreatTone = 'danger' | 'warning' | 'neutral' | 'dim';

export const THREAT_PILL_CLASS: Record<ThreatTone, string> = {
  danger: 'border-danger/60 bg-danger/10 text-danger',
  warning: 'border-warning/60 bg-warning/10 text-warning',
  neutral: 'border-line-bright bg-panel-2 text-text',
  dim: 'border-line bg-transparent text-text-dim',
};

export const THREAT_TEXT_CLASS: Record<ThreatTone, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-text',
  dim: 'text-text-dim',
};

export const THREAT_FILL_CLASS: Record<ThreatTone, string> = {
  danger: 'bg-danger/10',
  warning: 'bg-warning/10',
  neutral: '',
  dim: '',
};

export const THREAT_ROW_CLASS: Record<ThreatTone, string> = {
  danger: 'border-l-danger!',
  warning: 'bg-warning/5 border-l-warning!',
  neutral: '',
  dim: '',
};

export const THREAT_BAR_CLASS: Record<ThreatTone, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  neutral: 'bg-line-bright',
  dim: 'bg-line-bright',
};

export const THREAT_LEVEL_TONE: Record<ThreatLevel | 'pending', ThreatTone> = {
  dangerous: 'danger',
  active: 'warning',
  low: 'neutral',
  inactive: 'dim',
  pending: 'dim',
};
