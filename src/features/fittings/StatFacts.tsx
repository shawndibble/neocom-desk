import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Fields } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { unheatedIfChanged } from '@/engine/fittings/stats';
import type { StatChangeKey } from '@/engine/fittings/variationDelta';
import { PreviewedFigure } from './statPreview';
import { STAT_DETAIL, STAT_EYEBROW, statRowClassName } from './statKit';

export function HeatFigure<S extends { unheated: S | null }>({
  keys,
  ...props
}: {
  stats: S;
  format: (stats: S) => string;
  note?: string;
  toneClassName?: string;
  keys?: readonly StatChangeKey[];
}) {
  return (
    <PreviewedFigure keys={keys}>
      <PlainHeatFigure {...props} />
    </PreviewedFigure>
  );
}

function PlainHeatFigure<S extends { unheated: S | null }>({
  stats,
  format,
  note,
  toneClassName,
}: {
  stats: S;
  format: (stats: S) => string;
  note?: string;
  toneClassName?: string;
}) {
  const { t } = useTranslation();
  const unheated = unheatedIfChanged(stats, format);
  if (unheated === null) {
    if (note)
      return (
        <HintText content={note} className={toneClassName}>
          {format(stats)}
        </HintText>
      );
    return toneClassName ? (
      <span className={toneClassName}>{format(stats)}</span>
    ) : (
      <>{format(stats)}</>
    );
  }
  const was = t('fittings.stats.unheated', { value: unheated });
  return (
    <HintText content={note ? `${was} · ${note}` : was} className={toneClassName ?? 'text-warning'}>
      {format(stats)}
      <span className="sr-only"> ({was})</span>
    </HintText>
  );
}

const NOTE_TONE = {
  dim: 'text-text-dim',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

export function StatNote({
  tone = 'dim',
  children,
}: {
  tone?: keyof typeof NOTE_TONE;
  children: ReactNode;
}) {
  return <div className={`text-[0.6875rem] ${NOTE_TONE[tone]}`}>{children}</div>;
}

export function StatGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className={STAT_EYEBROW}>{label}</h4>
      {children}
    </div>
  );
}

export interface StatRowProps {
  name: ReactNode;
  detail?: ReactNode;
  detailTone?: 'warning';
  figure?: ReactNode;
  action?: ReactNode;
  inline?: boolean;
}

const FIGURE = 'max-w-[60%] shrink-0 text-right tabular-nums';

export function StatRowContent({
  name,
  detail,
  detailTone,
  figure,
  action,
  inline = false,
}: StatRowProps) {
  if (inline)
    return (
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1 font-semibold">{name}</span>
        {figure !== undefined && <span className={FIGURE}>{figure}</span>}
        {action}
      </span>
    );
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 font-semibold">{name}</span>
        {action}
      </span>
      {(detail !== undefined || figure !== undefined) && (
        <span className="flex items-start justify-between gap-3">
          <span
            className={`min-w-0 flex-1 ${STAT_DETAIL} ${detailTone === 'warning' ? 'text-warning' : ''}`}
          >
            {detail}
          </span>
          {figure !== undefined && <span className={FIGURE}>{figure}</span>}
        </span>
      )}
    </>
  );
}

export function StatRow(props: StatRowProps) {
  return (
    <li className={statRowClassName()}>
      <StatRowContent {...props} />
    </li>
  );
}

export function StatRows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col text-xs">{children}</ul>;
}

export function StatFields({ children }: { children: ReactNode }) {
  return <Fields variant="compact">{children}</Fields>;
}

export const StatField = Field;

export interface Fact {
  id?: string;
  label: string;
  value: ReactNode;
}

export function Facts({ items }: { items: Fact[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs tabular-nums">
      {items.map((item) => (
        <div key={item.id ?? item.label} className="min-w-0">
          <dt className="text-[0.6875rem] text-text-dim">{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
