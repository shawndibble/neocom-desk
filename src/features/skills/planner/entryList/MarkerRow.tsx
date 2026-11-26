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
  attributes?: Attributes;
  implants: Implants;
  onRemove: (markerIndex: number) => void;
  onEdit: (markerIndex: number) => void;
}

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
