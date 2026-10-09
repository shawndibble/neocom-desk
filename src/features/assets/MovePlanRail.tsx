import type { CSSProperties, ReactNode } from 'react';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { pickupHueVar } from './movePlanView';

/**
 * The vertical rail Plan a move draws on both of its screens: Character
 * headings and, under them, one stop per pickup location, ending at the
 * destination. The rail is a drawing of the route's shape, not a sequence:
 * the engine does not order pickups, so the dots are not numbered.
 */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <ol className="relative m-0 flex list-none flex-col gap-2.5 p-0 before:absolute before:top-3 before:bottom-4 before:left-[9px] before:w-0.5 before:bg-line-bright/55">
      {children}
    </ol>
  );
}

/** A Character's name on the rail, with their initial in place of a dot. */
export function RailHeading({
  name,
  leading,
  children,
}: {
  name: string;
  /** A control that selects everything under this heading. */
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li
      className={`${tappableRowClassName} relative flex items-center gap-2 pt-1 pl-[34px] font-medium`}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 left-[-5px] grid size-[30px] place-items-center rounded-full border-[3px] border-panel bg-accent/15 text-xs font-bold text-accent"
      >
        {initials(name)}
      </span>
      {leading}
      <span className="min-w-0 truncate">{name}</span>
      {children}
    </li>
  );
}

/** One stop: a dot in the pickup's colour (or accent, filled, for the destination) and a card. */
export function RailStop({
  hue,
  destination = false,
  neutral = false,
  className,
  children,
}: {
  hue?: number;
  destination?: boolean;
  /** A stop that is not part of the plan (already at the destination): a grey dot. */
  neutral?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const dot: CSSProperties = {
    borderColor: neutral
      ? 'var(--color-line-bright)'
      : hue === undefined
        ? 'var(--color-accent)'
        : pickupHueVar(hue),
  };
  return (
    <li className={cx('relative pl-[34px]', className)}>
      <span
        aria-hidden="true"
        style={dot}
        className={cx(
          'absolute top-3.5 left-0.5 size-4 rounded-full border-[3px]',
          destination ? 'bg-accent' : 'bg-panel'
        )}
      />
      {children}
    </li>
  );
}

/** Up to two initials: "Kira Vandt" is KV, "Test" is T. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.charAt(0) + (words[1]?.charAt(0) ?? '')).toUpperCase();
}
