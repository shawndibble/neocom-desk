import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { figureOpenerClassName } from '@/components/ui/controlStyles';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { romanLevel } from '@/engine/projection';
import { cx } from '@/lib/cx';
import type { NamedSkilledSource } from '@/features/fittings/useSkilledAttributes';

function sourceLine(source: NamedSkilledSource, t: TFunction): string {
  switch (source.kind) {
    case 'skill':
      return t('market.itemDetail.skilled.skillLine', {
        name: source.name,
        level: romanLevel(source.level ?? 0),
      });
    case 'implant':
      return t('market.itemDetail.skilled.implantLine', { name: source.name });
    case 'hull':
      return t('market.itemDetail.skilled.hullLine', { name: source.name });
  }
}

export interface SkilledValueProps {
  base?: string;
  skilled: string;
  spoken: string;
  label: string;
  sources: readonly NamedSkilledSource[];
  extra?: ReactNode;
  neutral?: boolean;
  className?: string;
}

export function SkilledValue({
  base,
  skilled,
  spoken,
  label,
  sources,
  extra,
  neutral = false,
  className,
}: SkilledValueProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const title = t('market.itemDetail.skilled.sourcesFor', { attribute: label });
  return (
    <span className={cx('tabular-nums', className)}>
      {base !== undefined && (
        <span aria-hidden className="text-text-dim">
          {base} →{' '}
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cx(figureOpenerClassName, !neutral && 'font-semibold text-success')}
            onClick={(event) => event.stopPropagation()}
          >
            <span aria-hidden>{skilled}</span>
            <span className="sr-only">{spoken}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2 text-xs" aria-label={title}>
          {sources.length > 0 && (
            <>
              <p className={eyebrowClassName}>{t('market.itemDetail.skilled.sourcesTitle')}</p>
              <ul className="space-y-0.5">
                {sources.map((source) => (
                  <li key={`${source.kind}:${source.typeId}`} className="text-text">
                    {sourceLine(source, t)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {extra && (
            <div className={cx('space-y-2', sources.length > 0 && 'border-t border-line pt-2')}>
              {extra}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
