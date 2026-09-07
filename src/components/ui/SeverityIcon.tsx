/**
 * One rung of the severity ladder, drawn.
 *
 * Wraps `SEVERITY_ICON` + `SEVERITY_TEXT` (`severityTone.ts`) so a caller
 * cannot take the tone and forget the glyph — DESIGN.md §7 is explicit that
 * colour is never the sole signal, and two records keyed the same way make
 * getting that wrong exactly as easy as getting it right.
 *
 * Decorative by default: on a row that already states its severity in words —
 * the corp board's rows carry an sr-only label, the Overview board's cards
 * name the count beside them — a second accessible name would only read the
 * rung twice. Pass `label` where the glyph really is the only statement of it.
 */
import { ICON_SIZE } from './icons';
import { SEVERITY_ICON, SEVERITY_TEXT } from './severityTone';
import type { DeadlineSeverity } from '@/engine/severity';

export interface SeverityIconProps {
  severity: DeadlineSeverity;
  /** An `ICON_SIZE` rung. Strings because those are `rem`, so icons scale with the text-size setting. */
  size?: string | number;
  className?: string;
  /** Accessible name. Omit on a row that already says its severity in text. */
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
