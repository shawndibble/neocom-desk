import type { ReactNode } from 'react';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/**
 * One ruled line of a "New to …?" explainer drawer (PI, Industry): a 32px
 * picture, a bold title over a dim sentence, and an optional chip at the end
 * (PI's tier chip).
 */
export function ExplainerRow({
  art,
  title,
  body,
  trailing,
}: {
  art: ReactNode;
  title: string;
  body: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center text-text-dim">{art}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-text">{title}</p>
        <p className="text-xs text-text-dim">{body}</p>
      </div>
      {trailing}
    </div>
  );
}

/** The down arrow between two `ExplainerRow` steps of a chain, naming what moves things on. */
export function ExplainerArrow({ label }: { label: string }) {
  return (
    <p className={cx(eyebrowClassName, 'py-1 pl-1')}>
      <Icon.Descending size={Icon.ICON_SIZE.sm} aria-hidden="true" className="mr-1 inline" />
      {label}
    </p>
  );
}
