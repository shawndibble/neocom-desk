import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Fields } from '@/components/ui';
import { unheatedIfChanged } from '@/engine/fittings/stats';
import { STAT_DETAIL, STAT_EYEBROW, statRowClassName } from './statKit';

/**
 * One figure as `format` shows it. Under "Overheat all" it reads in the
 * warning tone — the game's own mark for heat — only when heat changed it as
 * shown, with the unheated figure on hover; a figure heat leaves as it is
 * (a hold, the mass, a fitting budget) stays in the normal tone. `note`
 * joins the unheated figure on hover, since this title hides any the caller
 * set around it. `toneClassName` tints the figure by its own reading (the
 * capacitor's stability) and then wins over the heat tone; the unheated
 * figure still shows on hover.
 */
export function HeatFigure<S extends { unheated: S | null }>({
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
    return toneClassName ? (
      <span className={toneClassName}>{format(stats)}</span>
    ) : (
      <>{format(stats)}</>
    );
  }
  const was = t('fittings.stats.unheated', { value: unheated });
  return (
    <span className={toneClassName ?? 'text-warning'} title={note ? `${was} · ${note}` : was}>
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
 * labels in one column, controls lined up in the other. The stats column's
 * name for the shared `Fields` grid, in its `compact` look.
 */
export function StatFields({ children }: { children: ReactNode }) {
  return <Fields variant="compact">{children}</Fields>;
}

/** One labelled control in a `StatFields` grid; see `Field`. */
export const StatField = Field;

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
