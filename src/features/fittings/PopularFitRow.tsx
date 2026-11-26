import type { ComponentProps, ReactNode } from 'react';
import { disabledClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { isRowOwnEvent } from '@/components/ui/rowEvents';
import { Pill } from '@/components/ui/Pill';
import { cx } from '@/lib/cx';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { useTranslation } from 'react-i18next';
import type { FitSource } from './popularFitList';
import { RackIconStrip } from './RackIconStrip';

interface PopularFitRowProps {
  source: FitSource;
  title: string;
  meta?: ReactNode;
  price?: ReactNode;
  verdict?: ReactNode;
  details?: ReactNode;
  modules: ComponentProps<typeof RackIconStrip>['modules'];
  names: ComponentProps<typeof RackIconStrip>['names'];
  unusable?: ComponentProps<typeof RackIconStrip>['unusable'];
  children?: ReactNode;
  disabled?: boolean;
  onOpen: () => void;
}

export function PopularFitRow({
  source,
  title,
  meta,
  price,
  verdict,
  details,
  modules,
  names,
  unusable,
  children,
  disabled = false,
  onOpen,
}: PopularFitRowProps) {
  const { t } = useTranslation();
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  return (
    <div
      onClick={(event) => {
        if (disabled) return;
        const onIcon =
          !coarse &&
          event.target instanceof Element &&
          event.target.closest('[data-row-control][role="img"]');
        if (onIcon || isRowOwnEvent(event)) onOpen();
      }}
      className={cx(
        '-mx-2 -my-1.5 min-w-0 flex-1 px-2 py-1.5',
        disabled ? 'cursor-not-allowed' : cx(rowInteractiveClassName, 'cursor-pointer')
      )}
    >
      <div className="-mx-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/50 px-1 pt-1 pb-2">
        <Pill className="w-12 shrink-0 justify-center">{t(`fittings.popular.tag.${source}`)}</Pill>
        <p className="-mx-1 min-w-0 flex-1 basis-40 truncate px-1 text-sm">
          <button
            type="button"
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : onOpen}
            className={entityLinkClassName(disabledClassName)}
          >
            {title}
          </button>
          <span className="text-text-dim">{meta}</span>
        </p>
        {price !== undefined && (
          <span className="shrink-0 text-sm text-text tabular-nums">{price}</span>
        )}
        {verdict}
      </div>
      <RackIconStrip modules={modules} names={names} unusable={unusable} />
      {children}
      {details !== undefined && (
        <div data-row-control className="mt-2 cursor-auto border border-line bg-bg/60 p-2">
          {details}
        </div>
      )}
    </div>
  );
}
