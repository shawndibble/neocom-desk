import { eyebrowClassName } from './eyebrowClassName';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { useIsBelowDesktop } from '@/lib/useIsBelowDesktop';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { ActiveFilterRow } from './ActiveFilterRow';
import { clearFilters, type ActiveFilter } from './activeFilters';
import { Button } from './Button';
import { Collapse } from './Collapse';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { FilterSurfaceContext, useFilterSurface } from './filterSurface';
import { Modal } from './Modal';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { PrimarySearchContext } from './primarySearch';

export type { ActiveFilter } from './activeFilters';

interface FilterFieldProps {
  label: string;
  children: ReactNode;
  stretch?: boolean;
  captionInline?: boolean;
  hideCaption?: boolean;
  className?: string;
}

export function FilterField({
  label,
  children,
  stretch = true,
  captionInline = false,
  hideCaption = false,
  className = '',
}: FilterFieldProps) {
  const surface = useFilterSurface();
  if (surface === 'inline' && captionInline)
    return (
      <div data-filter-field={label} className={cx('flex flex-col items-start gap-1', className)}>
        <span className={eyebrowClassName}>{label}</span>
        {children}
      </div>
    );
  if (surface === 'inline' || hideCaption)
    return (
      <div data-filter-field={label} className={cx('contents', className)}>
        {children}
      </div>
    );
  return (
    <div
      data-filter-field={label}
      className={cx('flex flex-col items-start gap-1', stretch && 'w-full [&>*]:w-full', className)}
    >
      <span className={eyebrowClassName}>{label}</span>
      {children}
    </div>
  );
}

type RowAlign = 'center' | 'end' | 'start';
const ROW_ALIGN_CLASS: Record<RowAlign, string> = {
  center: 'items-center',
  end: 'items-end',
  start: 'items-start',
};

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusField(container: HTMLElement | null, label: string | null): void {
  if (!container) return;
  const field =
    label === null
      ? null
      : Array.from(container.querySelectorAll<HTMLElement>('[data-filter-field]')).find(
          (element) => element.dataset.filterField === label
        );
  const target =
    field?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]') ??
    field?.querySelector<HTMLElement>(FOCUSABLE) ??
    container.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
}

export type FilterControlsSurface = 'box' | 'sheet';

interface FilterBarProps<T> {
  value: T;
  onChange: (next: T) => void;
  search?: ReactNode;
  active?: readonly ActiveFilter<T>[];
  resultCount?: number;
  title?: string;
  children: (value: T, onChange: (next: T) => void, surface: FilterControlsSurface) => ReactNode;
  inline?: (value: T, onChange: (next: T) => void) => ReactNode;
  inlinePlacement?: 'row' | 'below';
  actions?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  rowAlign?: RowAlign;
  triggerSize?: ComponentProps<typeof IconButton>['size'];
  pointerSurface?: 'row' | 'popover';
}

export function FilterBar<T>(props: FilterBarProps<T>) {
  const isNarrow = useIsNarrow();
  if (!isNarrow && props.pointerSurface === 'popover') return <FilterPopover {...props} />;
  if (!isNarrow) return <CollapsibleFilterRow {...props} />;
  return <FilterSheet {...props} />;
}

function FilterTrigger({
  activeCount,
  expanded,
  haspopup,
  controls,
  onClick,
  size,
  buttonRef,
}: {
  activeCount: number;
  expanded?: boolean;
  haspopup?: 'dialog' | 'true';
  controls?: string;
  onClick?: () => void;
  size?: ComponentProps<typeof IconButton>['size'];
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const button = (
    <IconButton
      ref={buttonRef}
      icon={<Icon.Filter />}
      label={
        activeCount > 0 ? t('filters.openWithCount', { count: activeCount }) : t('filters.open')
      }
      size={size}
      {...(onClick && {
        ...(haspopup && { 'aria-haspopup': haspopup }),
        'aria-expanded': expanded,
        'aria-controls': controls,
        onClick,
      })}
    />
  );
  return (
    <span className="relative inline-flex shrink-0">
      {onClick ? button : <PopoverTrigger asChild>{button}</PopoverTrigger>}
      {activeCount > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full border border-accent-dim bg-accent px-1 text-center text-[0.6875rem] leading-4 font-semibold text-accent-contrast tabular-nums"
        >
          {activeCount}
        </span>
      )}
    </span>
  );
}

function ClearAllButton<T>({
  value,
  onChange,
  active,
  clearable = active,
}: {
  value: T;
  onChange: (next: T) => void;
  active: readonly ActiveFilter<T>[];
  clearable?: readonly ActiveFilter<T>[];
}) {
  const { t } = useTranslation();
  if (clearable.length === 0) return null;
  return (
    <div className="flex basis-full justify-end">
      <Button size="sm" variant="ghost" onClick={() => onChange(clearFilters(value, clearable))}>
        {t('filters.clearAll')}
      </Button>
    </div>
  );
}

function CollapsibleFilterRow<T>({
  value,
  onChange,
  search,
  active = [],
  title,
  actions,
  trailing,
  children,
  inline,
  inlinePlacement = 'row',
  className = '',
  rowAlign = 'center',
  triggerSize,
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const belowDesktop = useIsBelowDesktop();
  const inlineOn = inline !== undefined && (inlinePlacement === 'below' || !belowDesktop);
  const pills = inlineOn ? active.filter((filter) => !filter.inline) : active;
  const inlineNode = inlineOn ? inline?.(value, onChange) : null;
  const focusTarget = useRef<string | null>(null);
  const groupId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || focusTarget.current === null) return;
    focusField(boxRef.current, focusTarget.current);
    focusTarget.current = null;
  }, [open]);

  return (
    <div className={cx('flex flex-col', className)}>
      <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign])}>
        <PrimarySearchContext.Provider value>{search}</PrimarySearchContext.Provider>
        {inlinePlacement === 'row' && inlineNode}
        {actions}
        <FilterTrigger
          activeCount={pills.length}
          expanded={open}
          controls={groupId}
          size={triggerSize}
          buttonRef={triggerRef}
          onClick={() => setOpen((was) => !was)}
        />
        {trailing}
      </div>
      {inlinePlacement === 'below' && inlineNode && (
        <div className="flex flex-wrap items-center gap-2 pt-2">{inlineNode}</div>
      )}
      <Collapse open={!open && pills.length > 0} className="pt-2">
        <ActiveFilterRow
          active={pills}
          clearable={active}
          value={value}
          onChange={onChange}
          onOpen={(label) => {
            focusTarget.current = label;
            setOpen(true);
          }}
          onCleared={() => triggerRef.current?.focus()}
        />
      </Collapse>
      <Collapse open={open} id={groupId} className="pt-2">
        <div
          ref={boxRef}
          className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 p-2"
          aria-label={title ?? t('filters.title')}
          role="group"
        >
          {children(value, onChange, inlineOn ? 'box' : 'sheet')}
          <ClearAllButton value={value} onChange={onChange} active={pills} clearable={active} />
        </div>
      </Collapse>
    </div>
  );
}

function FilterPopover<T>({
  value,
  onChange,
  search,
  active = [],
  title,
  actions,
  trailing,
  children,
  className = '',
  rowAlign = 'center',
  triggerSize,
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  return (
    <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign], className)}>
      <PrimarySearchContext.Provider value>{search}</PrimarySearchContext.Provider>
      {actions}
      <Popover>
        <FilterTrigger activeCount={active.length} size={triggerSize} />
        <PopoverContent
          align="end"
          aria-label={title ?? t('filters.title')}
          className="flex w-max max-w-[min(28rem,calc(100vw-2rem))] flex-wrap items-center gap-2 p-2 lg:max-w-[min(44rem,calc(100vw-2rem))]"
        >
          {children(value, onChange, 'box')}
          <ClearAllButton value={value} onChange={onChange} active={active} />
        </PopoverContent>
      </Popover>
      {trailing}
    </div>
  );
}

function FilterSheet<T>({
  value,
  onChange,
  search,
  active = [],
  resultCount,
  title,
  actions,
  trailing,
  children,
  className = '',
  rowAlign = 'center',
  triggerSize,
  pointerSurface = 'row',
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const focusTarget = useRef<string | null>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [lastCommit, setLastCommit] = useState<{ value: T } | null>(null);
  const commit = (next: T) => {
    setLastCommit({ value: next });
    onChange(next);
  };
  const close = () => {
    setOpen(false);
    setLastCommit(null);
    if (lastCommit) setTimeout(() => onChange(lastCommit.value), 0);
  };

  useEffect(() => {
    const label = focusTarget.current;
    if (!open || label === null) return;
    focusTarget.current = null;
    const frame = requestAnimationFrame(() => focusField(sheetBodyRef.current, label));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const showPills = pointerSurface === 'row' && active.length > 0;

  return (
    <>
      <div className={cx('flex flex-col gap-2', className)}>
        <div className={cx('flex flex-wrap gap-2', ROW_ALIGN_CLASS[rowAlign])}>
          <PrimarySearchContext.Provider value>{search}</PrimarySearchContext.Provider>
          {actions}
          <FilterTrigger
            activeCount={active.length}
            expanded={open}
            haspopup="dialog"
            size={triggerSize}
            buttonRef={triggerRef}
            onClick={() => setOpen(true)}
          />
          {trailing}
        </div>
        {showPills && (
          <ActiveFilterRow
            active={active}
            value={value}
            onChange={onChange}
            onOpen={(label) => {
              focusTarget.current = label;
              setOpen(true);
            }}
            onCleared={() => triggerRef.current?.focus()}
          />
        )}
      </div>
      <Modal
        open={open}
        onClose={close}
        title={title ?? t('filters.title')}
        placement="sheet"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              disabled={active.length === 0}
              onClick={() => commit(clearFilters(value, active))}
            >
              {t('filters.clearAll')}
            </Button>
            <Button variant="primary" onClick={close}>
              {resultCount === undefined
                ? t('filters.done')
                : t('filters.showResults', { count: resultCount })}
            </Button>
          </div>
        }
      >
        <FilterSurfaceContext.Provider value="sheet">
          <div ref={sheetBodyRef} className="flex flex-col items-start gap-3">
            {children(value, commit, 'sheet')}
          </div>
        </FilterSurfaceContext.Provider>
      </Modal>
    </>
  );
}
