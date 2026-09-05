import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { Button } from './Button';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { FilterSurfaceContext, useFilterSurface } from './filterSurface';
import { Modal } from './Modal';

interface FilterFieldProps {
  /** Already-translated. Rendered in the sheet only; inline the control's own `aria-label` carries it. */
  label: string;
  children: ReactNode;
  /**
   * Whether the control fills the sheet's width. True for anything that reads
   * as a field; false for a control whose size *is* its shape, such as an
   * `IconButton`, which a full-width stretch would leave as a wide short box.
   */
  stretch?: boolean;
  className?: string;
}

/**
 * One labelled control inside a `FilterBar`.
 *
 * Inline it is a pass-through — a filter row is read left to right and a
 * caption above every select would double its height for nothing. In the sheet
 * the controls are stacked full-width with no neighbours to give them context,
 * so each gets its caption there.
 */
export function FilterField({ label, children, stretch = true, className = '' }: FilterFieldProps) {
  const surface = useFilterSurface();
  if (surface === 'inline') return <>{children}</>;
  // A `<div>`, not a `<label>`: most of what goes in here is a button — a
  // Radix `SelectTrigger`, a chip, an `IconButton` — and a button is not a
  // labelable element, so the caption would name nothing. The control's own
  // `aria-label` is what a screen reader gets; this caption is for the eye.
  // `[&>*]:w-full` because the control carries the width it needs *in the row*
  // — `w-44` on Wallet's ref-type trigger, `w-36` on its date fields. Stacked
  // in the sheet those read as half-empty fields against a full-width Apply
  // bar. The child selector outspecifies the utility on the control itself, so
  // no call site has to hold two widths.
  return (
    <div
      className={cx('flex flex-col items-start gap-1', stretch && 'w-full [&>*]:w-full', className)}
    >
      <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

interface FilterBarProps<T> {
  /** The committed filter state. Inline, edits land here immediately. */
  value: T;
  /** Commit: every edit inline, only Apply in the sheet. */
  onChange: (next: T) => void;
  /**
   * The search box. Stays in the row at every width — it is the page's primary
   * affordance, and burying it behind a trigger would cost more than it saves.
   */
  search?: ReactNode;
  /**
   * How many filters are set away from their default. Badges the trigger and
   * goes into its accessible name, so "this list is filtered" is not conveyed
   * by an accent colour alone (DESIGN.md §7).
   *
   * Supplied by the route rather than derived: knowing which values count as
   * "default" needs the route's own defaults object, and no generic
   * deep-compare is worth writing for that.
   */
  activeCount?: number;
  /** Heading for the sheet. Defaults to "Filters". */
  title?: string;
  /**
   * The controls, written once. Called with the draft to read and a setter to
   * edit it — inline those are `value`/`onChange` straight through, in the
   * sheet they are local state committed on Apply.
   */
  children: (draft: T, setDraft: (next: T) => void) => ReactNode;
  /** Wrapper class for the row. */
  className?: string;
}

/**
 * A page's filter controls: inline beside the search box on a pointer-width
 * screen, collapsed behind one trigger below `md`.
 *
 * A row of selects, date fields and chips is fine at 1280px and is most of the
 * screen at 390px — Wallet's journal filters alone stack to four rows on a
 * phone, above the table they exist to narrow. So on a narrow viewport the
 * controls move into a bottom sheet that the search box's trailing icon opens,
 * and edits there are a draft the user commits with Apply or throws away with
 * Cancel.
 *
 * The two surfaces are a conditional render, not a CSS collapse — deliberately
 * unlike `DataTable`'s "one DOM at every width" (DESIGN.md §4a). Draft state
 * cannot exist in a CSS-only collapse: Apply/Cancel needs the sheet's controls
 * bound to different state than the row's. `children` is still written once,
 * as a function of the draft, so neither surface can drift from the other and
 * no control is ever mounted twice.
 */
export function FilterBar<T>({
  value,
  onChange,
  search,
  activeCount = 0,
  title,
  children,
  className = '',
}: FilterBarProps<T>) {
  const isNarrow = useIsNarrow();

  if (!isNarrow) {
    return (
      <div className={cx('flex flex-wrap items-center gap-2', className)}>
        {search}
        {children(value, onChange)}
      </div>
    );
  }

  return (
    <FilterSheet
      value={value}
      onChange={onChange}
      search={search}
      activeCount={activeCount}
      title={title}
      className={className}
    >
      {children}
    </FilterSheet>
  );
}

/**
 * The narrow half of `FilterBar`, as its own component so that widening the
 * window unmounts it and takes the open sheet and its draft with it. The
 * alternative — an effect closing the sheet when the viewport grows — would
 * leave a modal sitting over controls that are now in the row behind it, and
 * would cascade a render to do it.
 */
function FilterSheet<T>({
  value,
  onChange,
  search,
  activeCount = 0,
  title,
  children,
  className = '',
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <>
      <div className={cx('flex flex-wrap items-center gap-2', className)}>
        {search}
        {/*
          The count rides on the trigger as a number, not as an accent tint:
          "some filter is on" has to survive a viewer who can't tell the two
          border colours apart (DESIGN.md §7). It repeats inside `label`, so
          it is announced rather than only drawn.
        */}
        <span className="relative inline-flex shrink-0">
          <IconButton
            icon={<Icon.Filter />}
            label={
              activeCount > 0
                ? t('filters.openWithCount', { count: activeCount })
                : t('filters.open')
            }
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => {
              // Seeded here rather than in an effect on `value`: a filter whose
              // options arrive from a fetch would otherwise re-seed mid-edit and
              // discard what the user had already picked. Seeding on every open
              // is also what stops a cancelled draft resurrecting itself.
              setDraft(value);
              setOpen(true);
            }}
          />
          {activeCount > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full border border-accent-dim bg-accent px-1 text-center text-[0.625rem] leading-4 font-semibold text-accent-contrast tabular-nums"
            >
              {activeCount}
            </span>
          )}
        </span>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title ?? t('filters.title')}
        placement="sheet"
      >
        <FilterSurfaceContext.Provider value="sheet">
          {/*
            `items-start` so a chip keeps its own width in the column — only a
            `FilterField` marked `stretch` fills the sheet, and a full-width
            uppercase pill reads as a field it is not.
          */}
          <div className="flex flex-col items-start gap-3">{children(draft, setDraft)}</div>
        </FilterSurfaceContext.Provider>
        {/*
          Sticky rather than a `Modal` footer prop: the sheet's body is the
          scroller, and five filters on a phone push a static Apply below the
          fold. The negative margins let the bar span the body's own padding.
        */}
        <div className="sticky bottom-0 -mx-3 -mb-3 mt-3 flex gap-2 border-t border-line bg-panel px-3 py-2">
          <Button className="flex-1" onClick={() => setOpen(false)}>
            {t('filters.cancel')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            {t('filters.apply')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
