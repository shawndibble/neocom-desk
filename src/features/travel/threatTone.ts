/**
 * The colours of the Threat verdict, shared by the badge beside a name, the
 * band's big word and its chips, so one level is one colour everywhere. Kept
 * apart from the components so they export components only. There is no
 * green: the verdict reads kills only, so it can never say a pilot is harmless
 * (decision `20261008-181210`).
 */
import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';

export type ThreatTone = 'danger' | 'warning' | 'neutral' | 'dim';

/** Border, fill and text of a pill (the badge and the chips). */
export const THREAT_PILL_CLASS: Record<ThreatTone, string> = {
  danger: 'border-danger/60 bg-danger/10 text-danger',
  warning: 'border-warning/60 bg-warning/10 text-warning',
  neutral: 'border-line-bright bg-panel-2 text-text',
  dim: 'border-line bg-transparent text-text-dim',
};

/** Text colour alone, for the band's big word. */
export const THREAT_TEXT_CLASS: Record<ThreatTone, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-text',
  dim: 'text-text-dim',
};

/** The band's faint tint behind the level word; levels without one stay on the panel. */
export const THREAT_FILL_CLASS: Record<ThreatTone, string> = {
  danger: 'bg-danger/10',
  warning: 'bg-warning/10',
  neutral: '',
  dim: '',
};

/**
 * A Local list row's wash and left edge, so a Dangerous pilot stands out
 * while scrolling a phone's cards. Only the two threatening levels are
 * tinted; Inactive and Low threat stay on the panel. The edge is `!` because the table row
 * already sets a transparent one.
 */
export const THREAT_ROW_CLASS: Record<ThreatTone, string> = {
  danger: 'bg-danger/10 border-l-danger!',
  warning: 'bg-warning/5 border-l-warning!',
  neutral: '',
  dim: '',
};

export const THREAT_LEVEL_TONE: Record<ThreatLevel | 'pending', ThreatTone> = {
  dangerous: 'danger',
  active: 'warning',
  low: 'neutral',
  inactive: 'dim',
  pending: 'dim',
};
