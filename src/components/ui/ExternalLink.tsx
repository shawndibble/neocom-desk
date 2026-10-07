import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { focusRingClassName, inlineLinkClassName, interactiveClassName } from './controlStyles';
import { External } from './icons';

/**
 * The trailing mark for anything that leaves Neocom Desk (DESIGN.md §6c): the
 * `Icon.External` glyph at about 0.85em, hidden from assistive tech, followed by
 * a visually hidden "(opens in a new tab)" so a screen reader hears what the
 * glyph shows. `ExternalLink` ends with it; a `Button` that calls `window.open`
 * puts it after its label so the two read the same.
 */
export function ExternalMark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <>
      <External
        size="0.85em"
        aria-hidden="true"
        className={cx('ml-[0.25em] inline-block shrink-0 align-[-0.1em]', className)}
      />
      <span className="sr-only">{t('common.opensInNewTab')}</span>
    </>
  );
}

/** `inline` sits in a sentence (solid underline); `quiet` is a footer link (text colour, underline on hover). */
export type ExternalLinkVariant = 'inline' | 'quiet';

const VARIANT_CLASS: Record<ExternalLinkVariant, string> = {
  inline: inlineLinkClassName,
  quiet: cx(
    'rounded-xs hover:text-text hover:underline underline-offset-2',
    interactiveClassName,
    focusRingClassName
  ),
};

interface ExternalLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'target' | 'rel'
> {
  href: string;
  variant?: ExternalLinkVariant;
  children?: ReactNode;
}

/**
 * A link to another site: always a new tab (`noopener noreferrer`) and always
 * marked with the trailing external glyph. The one place `target="_blank"` is
 * written in the app. A same-origin page (the privacy page) is a plain
 * same-tab `<a>`, not this.
 */
export function ExternalLink({
  href,
  variant = 'inline',
  className,
  children,
  ...anchorProps
}: ExternalLinkProps) {
  return (
    <a
      {...anchorProps}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(VARIANT_CLASS[variant], className)}
    >
      {children}
      <ExternalMark />
    </a>
  );
}
