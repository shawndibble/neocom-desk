/**
 * The pieces the Corp Tax Book's entity pages are stacked from: a header
 * with the big number first, sections with a count in the title, a link to
 * another entity, and the place line. They compose `Panel`, `CollapsiblePanel`,
 * `Button` and the link classes; nothing here is a new primitive.
 */
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
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { cx } from '@/lib/cx';
import { usePaged } from './usePaged';

/** A link to another entity page from outside a table (a moon in a list, a Miner in a header): a bordered accent link. In a table row it is plain `entityLinkClassName` text. */
export function EntityChip({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex max-w-full items-center rounded-xs border border-line px-1.5 py-0.5 text-xs text-accent',
        'hover:underline focus-visible:underline',
        focusRingClassName
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Where a day or a moon happened: the moon once (a link when it has a page), then only the
 * station under it, so the system name is never said twice.
 */
export function PlaceCell({
  refinery,
  moon,
  to,
}: {
  refinery: string;
  moon: string | undefined;
  /** The moon's page, when it has one. */
  to?: string;
}) {
  const place = splitPlace(refinery, moon);
  return (
    <span className="block min-w-0">
      {place.moon === undefined ? (
        place.station
      ) : (
        <>
          {to ? (
            <Link to={to} className={entityLinkClassName('whitespace-nowrap')}>
              {place.moon}
            </Link>
          ) : (
            <span className="whitespace-nowrap">{place.moon}</span>
          )}
          <span className="block text-xs text-text-dim">{place.station}</span>
        </>
      )}
    </span>
  );
}

/** The one-glance header of an entity page: the big number first, then the facts. */
export function EntityHeader({
  label,
  value,
  tone,
  note,
  facts,
}: {
  label: string;
  value: string;
  tone?: 'danger';
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
            tone === 'danger' ? 'text-danger' : 'text-text'
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

/**
 * One section of an entity page: a count in the title, the newest ten rows, a ghost
 * "Load older" in the foot and, once everything is shown, an end line. On a phone the caret
 * folds the section and a folded one still says what is inside. The page is one scroll of
 * these; there are no inner tabs.
 */
export function BookSection<T>({
  title,
  noun,
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
  /** What "Load older" and the end line name: "days", "payments". */
  noun: string;
  rows: readonly T[];
  /** The title's count when it is not the rows shown (a filtered list). */
  count?: number;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Controls over the rows (filter chips), shown even when the filter leaves none. */
  toolbar?: ReactNode;
  phone: boolean;
  startOpen?: boolean;
  /** One line shown while folded on a phone. */
  summary?: ReactNode;
  /** Columns whose `sortValue` orders the whole list before it is paged. */
  sortColumns?: readonly DataTableColumn<T>[];
  /** The rows to print, plus the sort props to hand the table. */
  children: (
    shown: readonly T[],
    table: { sort: DataTableSort | null; onSortChange: (sort: DataTableSort) => void }
  ) => ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(startOpen);
  const [sort, setSort] = useState<DataTableSort | null>(null);
  // Sorting only the loaded page would miss the older rows, so order everything, then page.
  const sorted = useMemo(() => {
    const column = sortColumns?.find((c) => c.id === sort?.columnId);
    return sort && column ? sortRows(rows, column, sort.direction) : rows;
  }, [rows, sortColumns, sort]);
  const paged = usePaged(sorted);
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
      {toolbar && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line p-2">{toolbar}</div>
      )}
      {rows.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-text-dim">
          {t('corpTaxBook.moons.sections.none', { noun })}
        </p>
      ) : (
        children(paged.rows, { sort, onSortChange: setSort })
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
    </CollapsiblePanel>
  );
}
