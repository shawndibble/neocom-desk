import { ICON_SIZE } from './icons';
import { SEVERITY_ICON, SEVERITY_TEXT } from './severityTone';
import type { DeadlineSeverity } from '@/engine/character/severity';

export interface SeverityIconProps {
  severity: DeadlineSeverity;
  size?: string | number;
  className?: string;
  label?: string;
}

export function SeverityIcon({
  severity,
  size = ICON_SIZE.sm,
  className,
  label,
}: SeverityIconProps) {
  const Glyph = SEVERITY_ICON[severity];
  return (
    <Glyph
      aria-hidden={label === undefined ? 'true' : undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
      size={size}
      className={`shrink-0 ${SEVERITY_TEXT[severity]} ${className ?? ''}`}
    />
  );
}
