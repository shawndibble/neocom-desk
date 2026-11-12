/**
 * The rail of section links a settings page shows from `md` up (DESIGN.md §6c "Settings
 * sections"): the app's Settings page and a feature's own settings (Vetting) draw the same
 * links and the same dot, so the two cannot drift.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

/** On the rail's `<nav>`: hidden on a phone, which has no room for a second column. */
export const sectionRailClassName = 'hidden md:sticky md:top-4 md:block md:self-start';

/** One section of the rail: a real link, so it opens in a new tab and can be bookmarked. */
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

/**
 * §6c: something inside this section needs attention now (an update, storage at risk, edits
 * not yet saved); clears when handled. `label` is what a screen reader hears.
 */
export function AttentionDot({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle"
    />
  );
}
