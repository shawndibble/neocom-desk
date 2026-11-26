import { fixed1 } from '@/lib/fixedFormat';
import { securityStatusColor, shownSecurity } from '@/engine/securityStatus';
import { cx } from '@/lib/cx';

export interface SecurityStatusProps {
  security: number;
  className?: string;
}

export function SecurityStatus({ security, className }: SecurityStatusProps) {
  return (
    <span
      className={cx('font-semibold tabular-nums', className)}
      style={{ color: securityStatusColor(security) }}
    >
      {fixed1(shownSecurity(security))}
    </span>
  );
}
