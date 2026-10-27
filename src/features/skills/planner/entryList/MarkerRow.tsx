import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import * as Icon from '@/components/ui/icons';
import type { Attributes, Implants } from '@/engine/types';
import { remapInstruction } from '../remapInstruction';
import { DANGER_ICON_BUTTON, GRIP_BUTTON, useRowSortable } from './rowChrome';

interface MarkerRowProps {
  id: string;
  markerIndex: number;
  /** This marker's target attribute spread — a manual override, or "Optimize at my markers"' result, once either is known. */
  attributes?: Attributes;
  /** The plan's implant lens, so the spread reads as the in-game remap screen does. */
  implants: Implants;
  onRemove: (markerIndex: number) => void;
  /** Opens the manual attribute editor (RemapMarkerModal) for this marker. */
  onEdit: (markerIndex: number) => void;
}

/**
 * Remap Marker (GLOSSARY.md): accent divider row, draggable like an entry.
 * Once its target attributes are known (a manual edit, or an "Optimize at my
 * markers" run), the divider gives way to the spread itself and the "REMAP
 * MARKER" label drops out entirely — the numbers already say what this row
 * is, and repeating the label next to them read as clutter. A plain marker
 * (nothing known yet) keeps the dividers and the label, same as always.
 * Either way the label/spread is a real button, not a click handler on the
 * `<li>`, so it doesn't fight the drag handle or the remove button for the
 * row's clicks: clicking it opens the manual attribute editor.
 *
 * Memoized (#408) like EntryRow/PrereqRow.
 */
export const MarkerRow = memo(function MarkerRow({
  id,
  markerIndex,
  attributes,
  implants,
  onRemove,
  onEdit,
}: MarkerRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(id);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 border-b border-line px-2 py-1 text-xs text-accent last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...handleProps}
        aria-label={t('plans.reorderMarker', { position: markerIndex + 1 })}
        className={GRIP_BUTTON}
      >
        <Icon.DragHandle />
      </button>
      {attributes ? (
        <button
          type="button"
          onClick={() => onEdit(markerIndex)}
          className={entityLinkClassName('flex-1 truncate text-left tabular-nums lg:scroll-mt-40')}
        >
          {remapInstruction(attributes, implants)}
        </button>
      ) : (
        <>
          <span aria-hidden className="h-px flex-1 bg-accent/60" />
          <button
            type="button"
            onClick={() => onEdit(markerIndex)}
            aria-label={t('plans.markerEdit', { position: markerIndex + 1 })}
            className={entityLinkClassName(
              'font-semibold tracking-widest uppercase lg:scroll-mt-40'
            )}
          >
            {t('plans.markerRow')}
          </button>
          <span aria-hidden className="h-px flex-1 bg-accent/60" />
        </>
      )}
      <button
        type="button"
        className={DANGER_ICON_BUTTON}
        aria-label={t('plans.removeMarker', { position: markerIndex + 1 })}
        onClick={() => onRemove(markerIndex)}
      >
        <Icon.Close size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      </button>
    </li>
  );
});
