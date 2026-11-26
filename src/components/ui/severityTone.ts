import type { DeadlineSeverity } from '@/engine/character/severity';
import * as Icon from './icons';

export const SEVERITY_FILL: Record<DeadlineSeverity, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  watch: 'bg-accent',
  clear: 'bg-text-dim',
};

export const SEVERITY_TEXT: Record<DeadlineSeverity, string> = {
  critical: 'text-danger',
  warning: 'text-warning',
  watch: 'text-accent',
  clear: 'text-text-dim',
};

export const SEVERITY_LABEL: Record<DeadlineSeverity, string> = {
  critical: 'corp.board.severity.critical',
  warning: 'corp.board.severity.warning',
  watch: 'corp.board.severity.watch',
  clear: 'corp.board.severity.clear',
};

export const SEVERITY_ICON: Record<DeadlineSeverity, typeof Icon.Warn> = {
  critical: Icon.SeverityCritical,
  warning: Icon.Warn,
  watch: Icon.SeverityWatch,
  clear: Icon.SeverityClear,
};
