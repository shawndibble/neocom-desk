/**
 * Item Detail's "base → skilled" figure (DESIGN.md §6c): the base dim, then
 * the pilot's value in `success` with a dashed underline — the figure opener,
 * a plain button whose popover says what made it: each skill at the pilot's
 * level, each implant, the hull's own bonus. `extra` joins the same popover
 * (a row's "which skill changes this" lines), so one number is one trigger.
 */
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
  /** The base figure, number only (dim, before the arrow); left out where base has its own column. */
  base?: string;
  /** The pilot's figure as shown (with its unit, unless a column header carries it). */
  skilled: string;
  /** What a screen reader hears for the whole figure. */
  spoken: string;
  /** What the popover is about, for its accessible name ("Armor Hitpoints"). */
  label: string;
  sources: readonly NamedSkilledSource[];
  /** More lines for the same popover (a row's per-skill effects and Add buttons). */
  extra?: ReactNode;
  className?: string;
}

export function SkilledValue({
  base,
  skilled,
  spoken,
  label,
  sources,
  extra,
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
            className={cx(figureOpenerClassName, 'font-semibold text-success')}
            // §6c figure opener: the press never reaches a row beneath.
            onClick={(event) => event.stopPropagation()}
          >
            <span aria-hidden>{skilled}</span>
            <span className="sr-only">{spoken}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2 text-xs" aria-label={title}>
          <p className={eyebrowClassName}>{t('market.itemDetail.skilled.sourcesTitle')}</p>
          <ul className="space-y-0.5">
            {sources.map((source) => (
              <li key={`${source.kind}:${source.typeId}`} className="text-text">
                {sourceLine(source, t)}
              </li>
            ))}
          </ul>
          {extra && <div className="space-y-2 border-t border-line pt-2">{extra}</div>}
        </PopoverContent>
      </Popover>
    </span>
  );
}
