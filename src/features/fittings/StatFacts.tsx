import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { unheatedIfChanged } from '@/engine/fittings/stats';
import { STAT_DETAIL, STAT_EYEBROW, statRowClassName } from './statKit';

/**
 * One figure as `format` shows it. Under "Overheat all" it reads in the
 * warning tone — the game's own mark for heat — only when heat changed it as
 * shown, with the unheated figure on hover; a figure heat leaves as it is
 * (a hold, the mass, a fitting budget) stays in the normal tone. `note`
 * joins the unheated figure on hover, since this title hides any the caller
 * set around it.
 */
export function HeatFigure<S extends { unheated: S | null }>({
  stats,
  format,
  note,
}: {
  stats: S;
  format: (stats: S) => string;
  note?: string;
}) {
  const { t } = useTranslation();
  const unheated = unheatedIfChanged(stats, format);
  if (unheated === null) return <>{format(stats)}</>;
  const was = t('fittings.stats.unheated', { value: unheated });
  return (
    <span className="text-warning" title={note ? `${was} · ${note}` : was}>
      {format(stats)}
      <span className="sr-only"> ({was})</span>
    </span>
  );
}

const NOTE_TONE = {
  dim: 'text-text-dim',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/** A footnote, a hint or an empty state (a short list, too): dim 11px, or a status tone. */
export function StatNote({
  tone = 'dim',
  children,
}: {
  tone?: keyof typeof NOTE_TONE;
  children: ReactNode;
}) {
  return <div className={`text-[0.6875rem] ${NOTE_TONE[tone]}`}>{children}</div>;
}

/** A labelled run of rows or facts inside a section ("Local tank", "Compression"). */
export function StatGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className={STAT_EYEBROW}>{label}</h4>
      {children}
    </div>
  );
}

export interface StatRowProps {
  /** What the row is: "4× Heavy Assault Missile Launcher II". Takes the full width, wrapping if it must. */
  name: ReactNode;
  /** Dim beneath the name: its charge, range, cycle (`joinDetail`). */
  detail?: ReactNode;
  /** The whole detail line is a warning ("Projects nothing"). */
  detailTone?: 'warning';
  /** The row's figure — or its controls — at the right of the detail line. */
  figure?: ReactNode;
  /** A control at the end of the name line (the row's ⋮). */
  action?: ReactNode;
  /** One line: the figure beside the name, for a row with nothing to detail (a total). */
  inline?: boolean;
}

const FIGURE = 'max-w-[60%] shrink-0 text-right tabular-nums';

/** A row's two lines: the name across the top, then the detail with the figure at its right. */
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

/** A list of things the fit carries — weapons, remote modules, miners, bursts — one row each. */
export function StatRows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col text-xs">{children}</ul>;
}

/**
 * The pickers at the top of a section, as a two-column grid of `StatField`s:
 * labels in one column, controls lined up in the other.
 */
export function StatFields({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs">
      {children}
    </div>
  );
}

/**
 * One labelled control in a `StatFields` grid: the label in the left column,
 * the control (`STAT_FIELD_WIDTH` wide) and its own action in the right, so
 * stacked controls line up however long their labels or values. `note` reads
 * dim beneath the control; a `warning` label marks a setting moved off its
 * default.
 */
export function StatField({
  label,
  tone,
  note,
  children,
}: {
  label: ReactNode;
  tone?: 'warning';
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span className={tone === 'warning' ? 'text-warning' : 'text-text-dim'}>{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      {note !== undefined && note !== null && note !== false && (
        <p className="col-start-2 -mt-1 text-[0.6875rem] text-text-dim">{note}</p>
      )}
    </>
  );
}

export interface Fact {
  /** Tells two facts with the same label apart (two of one repairer); the label otherwise. */
  id?: string;
  label: string;
  value: ReactNode;
}

/** Label-over-value pairs, two to a row — the compact body most stats sections use. */
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
