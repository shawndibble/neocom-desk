import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { focusRingClassName, inlineLinkClassName, interactiveClassName } from './controlStyles';
import { External } from './icons';

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

export type ExternalLinkVariant = 'inline' | 'quiet' | 'bare';

const VARIANT_CLASS: Record<ExternalLinkVariant, string> = {
  bare: '',
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
  mark?: 'glyph' | 'text';
  children?: ReactNode;
}

export function ExternalLink({
  href,
  variant = 'inline',
  mark = 'glyph',
  className,
  children,
  ...anchorProps
}: ExternalLinkProps) {
  const { t } = useTranslation();
  return (
    <a
      {...anchorProps}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(VARIANT_CLASS[variant], className)}
    >
      {children}
      {mark === 'glyph' ? (
        <ExternalMark />
      ) : (
        <span className="sr-only">{t('common.opensInNewTab')}</span>
      )}
    </a>
  );
}
