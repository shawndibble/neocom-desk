import type { ReactNode } from 'react';
import { Button, Tooltip } from '@/components/ui';

export function PlanToolAction({
  icon,
  label,
  onClick,
  disabled,
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  const button = (
    <Button
      size="md"
      align="start"
      className="w-full"
      onClick={onClick}
      aria-disabled={disabled || undefined}
    >
      <span aria-hidden="true" className="shrink-0 text-text-dim">
        {icon}
      </span>
      {label}
    </Button>
  );
  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
}
