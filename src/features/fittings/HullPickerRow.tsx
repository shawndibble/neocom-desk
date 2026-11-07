import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { cx } from '@/lib/cx';
import { FlyDot } from './shipTree/FlyDot';
import { flyLabel } from './shipTree/flyLabel';
import type { HullFlyMark } from './useHullFlyMarks';

interface HullPickerRowProps {
  hull: HullEntry;
  /** `undefined` before marks load, or for a hull the Ship Tree doesn't list. */
  mark: HullFlyMark | undefined;
  /** Keep the mark's column, so names line up. */
  marked: boolean;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
}

/** One hull in the hull picker: the Ship Tree's can-fly mark, the name, and Ω when it needs Omega. */
export function HullPickerRow({
  hull,
  mark,
  marked,
  selected,
  onSelect,
  onStart,
}: HullPickerRowProps) {
  const { t } = useTranslation();
  const statusId = useId();
  return (
    <button
      type="button"
      aria-pressed={selected}
      // The status describes, never renames: the name stays the hull's alone.
      aria-label={hull.name}
      aria-describedby={mark ? statusId : undefined}
      onClick={onSelect}
      onDoubleClick={onStart}
      className={cx(
        'flex min-h-9 w-full items-center gap-2 px-2 text-left text-sm',
        rowInteractiveClassName,
        focusRingInsetClassName,
        selected ? `${selectedRowClassName} text-accent` : 'border-l-2 border-l-transparent'
      )}
    >
      {marked && (
        <span className="flex w-2.5 shrink-0 justify-center">
          {mark && <FlyDot status={mark.status} />}
        </span>
      )}
      {/* Wraps rather than truncates: the marks never cost a hull its name. */}
      <span className="min-w-0 flex-1">{hull.name}</span>
      {mark?.needsOmega && (
        <span aria-hidden="true" className="font-serif font-bold text-omega">
          Ω
        </span>
      )}
      {mark && (
        <span id={statusId} className="sr-only">
          {mark.needsOmega
            ? `${flyLabel(t, mark.status)}, ${t('ships.tree.omega')}`
            : flyLabel(t, mark.status)}
        </span>
      )}
    </button>
  );
}
