import { romanLevel } from '@/engine/projection';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { formatCountdown } from '@/lib/duration';
import { useTimeZone } from '@/lib/timeFormat';
import { SkillLink } from '@/features/entities';
import { doneByText } from '../doneBy';
import type { AttributePair } from '../attributePairBands';
import type { ColumnVisibility } from '../columnPreference';
import type { MergedRow } from '../queueRows';
import { formatLevelLabel } from '../rowAnnouncer';
import { AttributePairBadge, MetaValue, TimeCell } from './cells';
import { AlphaCapMark, BoosterMark } from './marks';
import { GRIP_BUTTON, ICON_BUTTON, NAME_CELL, useRowSortable } from './rowChrome';

interface PrereqRowProps {
  row: Extract<MergedRow, { kind: 'prereq' }>;
  name: string;
  attributes: AttributePair | undefined;
  boosted: boolean;
  alphaCapped: boolean;
  startDate: Date | undefined;
  columns: ColumnVisibility;
  isDesktop: boolean;
  reducedMotion: boolean;
  onPromote: (rowId: string) => void;
  onStageSkillDetail: (skillTypeID: number) => void;
}

export const PrereqRow = memo(function PrereqRow({
  row,
  name,
  attributes,
  boosted,
  alphaCapped,
  startDate,
  columns,
  isDesktop,
  reducedMotion,
  onPromote,
  onStageSkillDetail,
}: PrereqRowProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(row.id, reducedMotion);
  const label = formatLevelLabel(name, row.step.level);

  const dragHandle = (
    <button
      type="button"
      {...handleProps}
      aria-label={t('plans.dragPrereq', { name: label })}
      className={GRIP_BUTTON}
    >
      <Icon.DragHandle />
    </button>
  );

  const promoteButton = (
    <button
      type="button"
      className={ICON_BUTTON}
      onClick={() => onPromote(row.id)}
      aria-label={t('plans.promotePrereq', { name: label })}
    >
      <Icon.AddToPlan size={Icon.ICON_SIZE.sm} aria-hidden="true" />
    </button>
  );

  const nameSpan = (
    <span className={NAME_CELL}>
      <SkillLink
        typeId={row.step.skillTypeID}
        onClick={() => onStageSkillDetail(row.step.skillTypeID)}
        className="truncate lg:scroll-mt-40"
      >
        {name}
      </SkillLink>{' '}
      <span className="shrink-0">
        <span>{romanLevel(row.step.level)}</span>
        <span className="ml-2 text-[0.6875rem] uppercase">{t('plans.prereq')}</span>
        {boosted && <BoosterMark />}
        {alphaCapped && <AlphaCapMark />}
      </span>
    </span>
  );

  const attributeBadge =
    columns.attributePair && attributes ? (
      <AttributePairBadge primary={attributes.primary} secondary={attributes.secondary} />
    ) : null;

  const metaLine =
    attributeBadge || columns.perLevelTime || columns.cumulativeTime ? (
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[0.6875rem]">
        {attributeBadge}
        {columns.perLevelTime && (
          <MetaValue label={t('plans.columnTakes')} value={formatCountdown(row.step.seconds)} />
        )}
        {columns.cumulativeTime && (
          <MetaValue
            label={t('plans.columnDoneBy')}
            value={doneByText(row.step.cumulativeSeconds, startDate, timeZone)}
          />
        )}
      </div>
    ) : null;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`border-b border-line px-2 py-1.5 text-xs text-text-dim italic last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      {isDesktop ? (
        <div className="flex items-center justify-between gap-2">
          {dragHandle}
          {nameSpan}
          {attributeBadge}
          {columns.perLevelTime && (
            <TimeCell value={formatCountdown(row.step.seconds)} label={t('plans.columnTakes')} />
          )}
          {columns.cumulativeTime && (
            <TimeCell
              value={doneByText(row.step.cumulativeSeconds, startDate, timeZone)}
              label={t('plans.columnDoneBy')}
            />
          )}
          {promoteButton}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            {dragHandle}
            {nameSpan}
            {promoteButton}
          </div>
          {metaLine}
        </>
      )}
    </li>
  );
});
