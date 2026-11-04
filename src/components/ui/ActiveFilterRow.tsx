import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { useObservedMeasure } from '@/lib/useObservedMeasure';
import { Button } from './Button';
import { controlHeightClassName, focusRingClassName } from './controlStyles';
import { fitPills } from './fitPills';
import * as Icon from './icons';
import { activeFilterText, type ActiveFilter } from './activeFilters';

/** The row's gap, in px: `gap-2`. Read by `fitPills`. */
const GAP_PX = 8;

const pillClassName = cx(
  'inline-flex shrink-0 items-stretch overflow-hidden rounded-xs border border-accent-dim bg-accent/15 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap text-accent uppercase',
  controlHeightClassName.sm
);
const pillPartClassName = cx(
  // `uppercase` again: Tailwind's preflight resets a button's text-transform,
  // and the measured copy (plain spans) must be the same width as the pill.
  'inline-flex items-center uppercase hover:bg-accent/22 active:bg-accent/28',
  focusRingClassName,
  // Inset, so the ring is not clipped by the pill's own rounded overflow.
  'focus-visible:outline-offset-[-2px]'
);

interface ActiveFilterRowProps<T> {
  active: readonly ActiveFilter<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Open the filter controls, focusing the one captioned `label`. */
  onOpen: (label: string) => void;
  /** Called after a remove or Clear all, so focus can go somewhere that still exists. */
  onCleared: () => void;
}

/**
 * The active filters as one line of pills, never wrapping: what does not fit
 * folds into a "+N" pill that opens the controls, and "Clear all" always ends
 * the line. Widths come from an invisible copy of every pill, so the line can
 * grow back as well as shrink when the panel widens.
 */
export function ActiveFilterRow<T>({
  active,
  value,
  onChange,
  onOpen,
  onCleared,
}: ActiveFilterRowProps<T>) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(active.length);
  const texts = active.map(activeFilterText);
  const hiddenCount = active.length - Math.min(fit, active.length);

  useObservedMeasure(
    () => (rowRef.current ? [rowRef.current] : null),
    () => {
      const row = rowRef.current;
      const measure = measureRef.current;
      if (!row || !measure) return;
      const widths = Array.from(measure.children, (child) => child.getBoundingClientRect().width);
      setFit(
        fitPills({
          pills: widths.slice(0, active.length),
          more: widths[active.length] ?? 0,
          trailing: widths[active.length + 1] ?? 0,
          available: row.clientWidth,
          gap: GAP_PX,
        })
      );
    },
    [texts.join('\u0000')],
    { layout: true }
  );

  const remove = (filter: ActiveFilter<T>) => {
    onChange(filter.clear(value));
    onCleared();
  };
  const clearAll = () => {
    onChange(active.reduce((next, filter) => filter.clear(next), value));
    onCleared();
  };
  const visible = active.slice(0, Math.min(fit, active.length));
  const firstHidden = active[visible.length];

  return (
    <div className="relative">
      {/* Every pill, laid out but never seen, for `fitPills` to measure. The
          clipping wrapper keeps its full width from widening the page. */}
      <div aria-hidden className="invisible absolute top-0 left-0 h-0 w-0 overflow-hidden">
        <div ref={measureRef} className="flex w-max gap-2">
          {texts.map((text) => (
            <span key={text} className={pillClassName}>
              <span className="px-2.5">{text}</span>
              <span className="inline-flex items-center px-1.5">
                <Icon.Close size={Icon.ICON_SIZE.sm} />
              </span>
            </span>
          ))}
          <span className={cx(pillClassName, 'px-2.5')}>
            {t('filters.more', { count: active.length })}
          </span>
          <Button size="sm" variant="ghost" tabIndex={-1}>
            {t('filters.clearAll')}
          </Button>
        </div>
      </div>
      <div
        ref={rowRef}
        role="group"
        aria-label={t('filters.activeLabel')}
        className="flex min-w-0 flex-nowrap items-center gap-2"
      >
        {visible.map((filter) => {
          const text = activeFilterText(filter);
          return (
            <span key={text} className={pillClassName}>
              <button
                type="button"
                className={cx(pillPartClassName, 'px-2.5')}
                aria-label={t('filters.editOne', { filter: text })}
                onClick={() => onOpen(filter.label)}
              >
                {text}
              </button>
              <button
                type="button"
                className={cx(pillPartClassName, 'border-l border-accent-dim/60 px-1.5')}
                aria-label={t('filters.removeOne', { filter: text })}
                onClick={() => remove(filter)}
              >
                <Icon.Close size={Icon.ICON_SIZE.sm} />
              </button>
            </span>
          );
        })}
        {firstHidden && (
          <button
            type="button"
            className={cx(pillClassName, pillPartClassName, 'px-2.5')}
            aria-label={t('filters.moreLabel', { count: hiddenCount })}
            onClick={() => onOpen(firstHidden.label)}
          >
            {t('filters.more', { count: hiddenCount })}
          </button>
        )}
        <Button size="sm" variant="ghost" onClick={clearAll} className="shrink-0">
          {t('filters.clearAll')}
        </Button>
      </div>
    </div>
  );
}
