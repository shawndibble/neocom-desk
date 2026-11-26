import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CollapsiblePanel,
  sortRows,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { cx } from '@/lib/cx';
import { tapTargetClassName, useCards } from './sectionHelpers';
import { usePaged } from './usePaged';

export function UndockableChip() {
  const { t } = useTranslation();
  return (
    <Pill tone="warning" className="ml-1.5 align-middle">
      {t('corpTaxBook.moons.undockable')}
    </Pill>
  );
}

export function PlaceCell({
  refinery,
  moon,
  to,
  refineryTo,
  accent = false,
  undockable = false,
}: {
  refinery: string;
  moon: string | undefined;
  to?: string;
  refineryTo?: string;
  accent?: boolean;
  undockable?: boolean;
}) {
  const place = splitPlace(refinery, moon);
  const chip = undockable ? <UndockableChip /> : null;
  if (refineryTo) {
    return (
      <span className="block min-w-0">
        <Link
          to={refineryTo}
          className={entityLinkClassName(cx('[overflow-wrap:anywhere]', tapTargetClassName))}
        >
          {place.station}
        </Link>
        {chip}
        {place.moon !== undefined && (
          <span className="block text-xs text-text-dim">{place.moon}</span>
        )}
      </span>
    );
  }
  return (
    <span className="block min-w-0">
      {place.moon === undefined ? (
        <>
          {place.station}
          {chip}
        </>
      ) : (
        <>
          {to ? (
            <Link
              to={to}
              className={entityLinkClassName(cx('whitespace-nowrap', tapTargetClassName))}
            >
              {place.moon}
            </Link>
          ) : (
            <span className={cx('whitespace-nowrap', accent && 'text-accent')}>{place.moon}</span>
          )}
          <span className="block text-xs text-text-dim">
            {place.station}
            {chip}
          </span>
        </>
      )}
    </span>
  );
}

export function EntityHeader({
  label,
  value,
  tone,
  note,
  facts,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'success';
  note?: ReactNode;
  facts: { label: string; value: ReactNode }[];
}) {
  return (
    <div className="grid gap-4 rounded-xs border border-line bg-panel p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center">
      <div>
        <p className={eyebrowClassName}>{label}</p>
        <p
          className={cx(
            'text-3xl font-semibold tabular-nums',
            tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-isk-pos' : 'text-text'
          )}
        >
          {value}
        </p>
        {note && <p className="mt-1 text-xs text-text-dim">{note}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className={eyebrowClassName}>{f.label}</dt>
            <dd className="text-sm tabular-nums">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function BookSection<T>({
  title,
  noun,
  empty,
  rows,
  count = rows.length,
  meta,
  actions,
  toolbar,
  phone,
  startOpen = true,
  summary,
  sortColumns,
  children,
}: {
  title: string;
  noun: string;
  empty?: string;
  rows: readonly T[];
  count?: number;
  meta?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  phone: boolean;
  startOpen?: boolean;
  summary?: ReactNode;
  sortColumns?: readonly DataTableColumn<T>[];
  children: (
    shown: readonly T[],
    table: {
      sort: DataTableSort | null;
      onSortChange: (sort: DataTableSort) => void;
      stacked: boolean;
    }
  ) => ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(startOpen);
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const sorted = useMemo(() => {
    const column = sortColumns?.find((c) => c.id === sort?.columnId);
    return sort && column ? sortRows(rows, column, sort.direction) : rows;
  }, [rows, sortColumns, sort]);
  const paged = usePaged(sorted);
  const [widthRef, cards] = useCards();
  return (
    <CollapsiblePanel
      title={`${title} · ${count}`}
      meta={meta}
      actions={actions}
      wrapMeta
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
      labels={{
        show: t('corpTaxBook.moons.sections.show', { title }),
        hide: t('corpTaxBook.moons.sections.hide', { title }),
      }}
      collapsible={phone}
      collapsedSummary={
        summary ? (
          <p className="px-3 py-2 text-sm text-text-dim tabular-nums">{summary}</p>
        ) : undefined
      }
      padded={false}
    >
      <div ref={widthRef}>
        {toolbar && (
          <div className="flex flex-wrap items-center gap-1 border-b border-line p-2">
            {toolbar}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-text-dim">
            {empty ?? t('corpTaxBook.moons.sections.none', { noun })}
          </p>
        ) : (
          children(paged.rows, { sort, onSortChange: setSort, stacked: cards })
        )}
        {paged.remaining > 0 && (
          <div className="border-t border-line p-2">
            <Button size="sm" variant="ghost" className="w-full" onClick={paged.loadOlder}>
              {t('corpTaxBook.moons.sections.loadOlder', { noun, count: paged.remaining })}
            </Button>
          </div>
        )}
        {paged.atEnd && (
          <p className="border-t border-line px-3 py-2 text-center text-xs text-text-dim">
            {t('corpTaxBook.moons.sections.end', { noun })}
          </p>
        )}
      </div>
    </CollapsiblePanel>
  );
}
