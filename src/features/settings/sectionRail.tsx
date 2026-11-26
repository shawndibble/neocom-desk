import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

export const sectionRailClassName = 'hidden md:sticky md:top-4 md:block md:self-start';

export function SectionRailLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'block border-l-2 px-2 py-1.5 text-xs',
        interactiveClassName,
        focusRingInsetClassName,
        active
          ? 'border-accent bg-panel text-text'
          : 'border-transparent text-text-dim hover:bg-panel-2 hover:text-text active:bg-panel'
      )}
    >
      {children}
    </Link>
  );
}

export function AttentionDot({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle"
    />
  );
}
