/**
 * The Gallery: "Add a widget". A 460px drawer on the right on a desktop, a
 * bottom sheet on a phone.
 *
 * The header stays put (title, a one-line count, search and ONE scrolling row
 * of category chips) while the list scrolls under it. Under All the list is
 * grouped by category in catalogue order; under a single category, or a
 * search, it is one flat list. Each item is a card: the kind's name and its
 * action, one line of description, small badges for the views it supports and
 * its default size, and, on a desktop, a preview: the widget's body (no
 * repeated title) at its default size and view, drawing sample figures, made
 * inert (no focus, no clicks, hidden from assistive tech, no network).
 *
 * Adding on a desktop keeps the drawer open and the card says "Added" for a
 * moment, so the click has feedback; on a phone the sheet covers the page, so
 * it closes and lets the pilot see what they added.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  EmptyState,
  FilterChip,
  Modal,
  SearchInput,
  SegmentedControl,
  SlideOver,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { boardKey, categoryOn, useWidgetBoard } from './board';
import {
  categoryCounts,
  featuredKinds,
  groupByCategory,
  kindInstanceCounts,
  matchKinds,
  notOnBoard,
  type CategoryFilter,
} from './galleryFilter';
import { useOverviewEdit } from './editContext';
import { sampleHasChart, sampleView } from './gallerySamples';
import { type WidgetKindDef, type WidgetSize, type WidgetView } from './kinds';
import { MAX_WIDGETS, newWidget, type WidgetInit } from './layout';
import { PRESET_KINDS, presetsOf, type GalleryPreset } from './galleryPresets';
import { Widget } from './Widget';

interface GalleryProps {
  open: boolean;
  onClose: () => void;
}

/** The drawer's width, and the wide "Browse all" layout's: most of the page, so the board's left edge stays in view. */
const COMPACT_WIDTH = 'max-w-[460px]';
const BROWSE_WIDTH = 'max-w-[min(80vw,88rem)]';

/** How long the "Added" confirmation stays on a card. */
const ADDED_MS = 2200;

/** How wide the preview draws a kind's default size inside its frame: a share of a row would be a sliver at drawer width. */
const PREVIEW_WIDTH: Record<WidgetSize, string> = {
  S: 'w-[13.75rem]',
  M: 'w-[19rem]',
  L: 'w-full',
  F: 'w-full',
};

const noop = () => undefined;

function previewView(kind: WidgetKindDef, t: TFunction): WidgetView {
  const hasChart = sampleHasChart(kind.id, t);
  if (kind.defaultView === 'chart' && hasChart) return 'chart';
  if (kind.defaultView === 'table') return 'table';
  return kind.views.includes('chart') && hasChart ? 'chart' : 'number';
}

function Preview({ kind, preset }: { kind: WidgetKindDef; preset?: GalleryPreset }) {
  const { t } = useTranslation();
  // A preset previews its own sample, in its own view and size, not its kind's.
  const sampleKey = preset?.sample ?? kind.id;
  const size = preset?.init.size ?? kind.defaultSize;
  const view = useMemo(() => sampleView(sampleKey, t), [sampleKey, t]);
  const widget = useMemo(() => {
    const base = newWidget(kind.id, `preview-${sampleKey}`, preset?.init.show);
    return base ? { ...base, view: preset?.init.view ?? previewView(kind, t) } : null;
  }, [kind, preset, sampleKey, t]);
  if (!view || !widget) return null;
  return (
    // Inert: a picture of the widget, not one. Nothing in it takes focus or a click.
    <div
      aria-hidden="true"
      inert
      data-testid="gallery-preview"
      className="pointer-events-none relative max-h-44 overflow-hidden rounded-xs border border-line bg-bg p-2.5 select-none"
    >
      <div className={cx('mx-auto max-w-full', PREVIEW_WIDTH[size])}>
        <Widget widget={widget} onRemove={noop} previewView={view} hideHeader />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <li className="rounded-xs border border-line px-1.5 py-px text-[0.6875rem] text-text-dim">
      {children}
    </li>
  );
}

function GalleryItem({
  kind,
  count,
  full,
  isPhone,
  showPreview,
  dim,
  justAdded,
  onAdd,
}: {
  kind: WidgetKindDef;
  count: number;
  full: boolean;
  isPhone: boolean;
  showPreview: boolean;
  /** Already on the board: quieter, so what is still missing stands out. */
  dim: boolean;
  justAdded: boolean;
  onAdd: (kind: string) => void;
}) {
  const { t } = useTranslation();
  const board = useWidgetBoard();
  const title = t(kind.titleKey);
  const soon = kind.availability === 'comingSoon';
  // The status line is always mounted so a screen reader hears its text change.
  let status = '';
  if (justAdded) status = t('overview.gallery.added');
  else if (count > 0) status = t(boardKey(board, 'gallery.onBoard'), { count });
  let action = null;
  if (soon) {
    // Nothing to press: the badge beside the name says why.
  } else if (full) {
    action = <span className="text-xs text-text-dim">{t('overview.gallery.limit')}</span>;
  } else {
    action = (
      <Button
        variant={count > 0 ? 'ghost' : 'primary'}
        size={isPhone ? 'md' : 'sm'}
        className={isPhone ? 'min-h-11 min-w-20' : undefined}
        aria-label={
          count > 0
            ? t('overview.gallery.addAnotherLabel', { title })
            : t('overview.gallery.addLabel', { title })
        }
        onClick={() => onAdd(kind.id)}
      >
        {count > 0 ? t('overview.gallery.addAnother') : t('overview.gallery.add')}
      </Button>
    );
  }
  return (
    <li
      className={cx(
        'grid gap-2 rounded-xs border border-line bg-panel-2 p-3',
        soon && 'opacity-60',
        dim && 'opacity-75'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            {title}
            {soon && (
              <span className="rounded-xs border border-line-bright px-1.5 text-[0.5625rem] font-bold tracking-widest text-text-dim uppercase">
                {t('overview.gallery.comingSoon')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[0.8125rem] text-text-dim">{t(kind.descKey)}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <ul
          aria-label={t('overview.gallery.facts')}
          className="flex flex-wrap items-center gap-1.5"
        >
          {kind.views.map((view) => (
            <Badge key={view}>{t(`overview.menu.views.${view}`)}</Badge>
          ))}
          <Badge>
            {t('overview.gallery.sizeBadge', {
              size: t(`overview.customize.size.${kind.defaultSize}`),
            })}
          </Badge>
        </ul>
        <span
          role="status"
          className={cx(
            'ml-auto flex items-center gap-1 text-xs whitespace-nowrap',
            justAdded ? 'font-semibold text-success' : 'text-text-dim'
          )}
        >
          {justAdded && <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
          {status}
        </span>
      </div>
      {showPreview && !soon && <Preview kind={kind} />}
    </li>
  );
}

/** A preset: adds the kind's widget with some settings already chosen (`galleryPresets.ts`). Listed with its kind's card. */
function PresetItem({
  kind,
  preset,
  full,
  isPhone,
  showPreview,
  justAdded,
  onAdd,
}: {
  kind: WidgetKindDef;
  preset: GalleryPreset;
  full: boolean;
  isPhone: boolean;
  showPreview: boolean;
  justAdded: boolean;
  onAdd: (preset: GalleryPreset, title: string) => void;
}) {
  const { t } = useTranslation();
  const title = t(`overview.gallery.presets.${preset.id}.title`);
  return (
    <li className="grid gap-2 rounded-xs border border-line bg-panel-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-0.5 text-[0.8125rem] text-text-dim">
            {t(`overview.gallery.presets.${preset.id}.desc`)}
          </p>
        </div>
        <div className="shrink-0">
          {full ? (
            <span className="text-xs text-text-dim">{t('overview.gallery.limit')}</span>
          ) : (
            <Button
              variant="primary"
              size={isPhone ? 'md' : 'sm'}
              className={isPhone ? 'min-h-11 min-w-20' : undefined}
              aria-label={t('overview.gallery.addLabel', { title })}
              onClick={() => onAdd(preset, title)}
            >
              {t('overview.gallery.add')}
            </Button>
          )}
        </div>
      </div>
      <span
        role="status"
        className="flex h-4 items-center gap-1 text-xs font-semibold text-success"
      >
        {justAdded && <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
        {justAdded ? t('overview.gallery.added') : ''}
      </span>
      {showPreview && <Preview kind={kind} preset={preset} />}
    </li>
  );
}

type Density = 'grid' | 'list';

function GalleryBody({
  isPhone,
  browse,
  onToggleBrowse,
  onDone,
  onAdded,
  searchRef,
  subtitle,
}: {
  isPhone: boolean;
  /** The wide "Browse all" layout (a desktop only mode): rail, grid, Featured, filters. */
  browse: boolean;
  onToggleBrowse: () => void;
  onDone: () => void;
  onAdded: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** The count line: the drawer carries it in its title bar, so only the sheet draws it here. */
  subtitle: string;
}) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const board = useWidgetBoard();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [unusedOnly, setUnusedOnly] = useState(true);
  const [density, setDensity] = useState<Density>('grid');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [addedHere, setAddedHere] = useState<ReadonlySet<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const counts = useMemo(() => kindInstanceCounts(edit.layout.widgets), [edit.layout.widgets]);
  const full = edit.layout.widgets.length >= MAX_WIDGETS;

  const offered = board.kinds.filter(board.canDraw);
  const matching = matchKinds(offered, query, (kind) => {
    const own = `${t(kind.titleKey)} ${t(kind.descKey)}`;
    const presets = presetsOf(kind.id);
    if (presets.length === 0) return own;
    return `${own} ${presets.map((p) => t(`overview.gallery.presets.${p.id}.title`)).join(' ')}`;
  });
  // "Not on your board" only narrows the wide layout: the drawer keeps listing everything.
  const hidingUsed = browse && unusedOnly;
  // A kind with presets stays listed: its presets add a second widget, which is the point of a preset.
  const kept = new Set([...addedHere, ...PRESET_KINDS]);
  const shown = hidingUsed ? notOnBoard(matching, counts, kept) : matching;
  const catCounts = categoryCounts(shown, board);
  const items = shown.filter((kind) => category === 'all' || categoryOn(board, kind) === category);

  const chips: { id: CategoryFilter; label: string; count: number }[] = [
    { id: 'all', label: t('overview.gallery.categories.all'), count: catCounts.all },
    ...board.categories.map((id) => ({
      id,
      label: t(`overview.gallery.categories.${id}`),
      count: catCounts[id],
    })),
  ];

  const add = (id: string, init?: WidgetInit, key = id) => {
    edit.add(id, init);
    onAdded();
    if (isPhone) return;
    setAddedHere((prev) => new Set(prev).add(id));
    setJustAdded(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustAdded(null), ADDED_MS);
  };

  // A search that names a preset shows that preset; one that matches the kind itself shows them all.
  const presetsFor = (kind: WidgetKindDef) => {
    const presets = presetsOf(kind.id);
    const needle = query.trim().toLowerCase();
    if (!needle || `${t(kind.titleKey)} ${t(kind.descKey)}`.toLowerCase().includes(needle)) {
      return presets;
    }
    return presets.filter((p) =>
      t(`overview.gallery.presets.${p.id}.title`).toLowerCase().includes(needle)
    );
  };

  const withPreview = !isPhone && !(browse && density === 'list');
  const renderItem = (kind: WidgetKindDef) => [
    <GalleryItem
      key={kind.id}
      kind={kind}
      count={counts.get(kind.id) ?? 0}
      full={full}
      isPhone={isPhone}
      showPreview={withPreview}
      dim={browse && (counts.get(kind.id) ?? 0) > 0}
      justAdded={justAdded === kind.id}
      onAdd={(id) => add(id)}
    />,
    ...presetsFor(kind).map((preset) => (
      <PresetItem
        key={`${kind.id}:${preset.id}`}
        kind={kind}
        preset={preset}
        full={full}
        isPhone={isPhone}
        showPreview={withPreview}
        justAdded={justAdded === `${kind.id}:${preset.id}`}
        onAdd={(p, title) =>
          add(kind.id, p.titled ? { ...p.init, title } : p.init, `${kind.id}:${p.id}`)
        }
      />
    )),
  ];
  const listClass =
    browse && density === 'grid'
      ? 'grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2'
      : 'grid gap-2';

  // Featured leads the wide layout's All view; its kinds are not repeated below it.
  const featured = browse && category === 'all' && !query.trim() ? featuredKinds(board, shown) : [];
  const featuredIds = new Set(featured.map((kind) => kind.id));

  let list;
  if (items.length === 0) {
    list = (
      <EmptyState
        title={
          query.trim()
            ? t('overview.gallery.noMatch', { query: query.trim() })
            : t('overview.gallery.allOnBoard')
        }
        hint={
          query.trim() ? t('overview.gallery.noMatchHint') : t('overview.gallery.allOnBoardHint')
        }
        action={
          query.trim() ? (
            <Button size={isPhone ? 'md' : 'sm'} onClick={() => setQuery('')}>
              {t('overview.gallery.clearSearch')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setUnusedOnly(false)}>
              {t('overview.gallery.showAll')}
            </Button>
          )
        }
      />
    );
  } else if (category === 'all') {
    list = (
      <div className="grid gap-5">
        {featured.length > 0 && (
          <section aria-labelledby="gallery-group-featured" className="grid gap-2">
            <h3 id="gallery-group-featured" className={eyebrowClassName}>
              {t('overview.gallery.featured')}
            </h3>
            <ul className={listClass}>{featured.map(renderItem)}</ul>
          </section>
        )}
        {groupByCategory(
          items.filter((kind) => !featuredIds.has(kind.id)),
          board
        ).map((group) => (
          <section
            key={group.category}
            aria-labelledby={`gallery-group-${group.category}`}
            className="grid gap-2"
          >
            <h3 id={`gallery-group-${group.category}`} className={eyebrowClassName}>
              {t(`overview.gallery.categories.${group.category}`)}
            </h3>
            <ul className={listClass}>{group.kinds.map(renderItem)}</ul>
          </section>
        ))}
      </div>
    );
  } else {
    list = <ul className={listClass}>{items.map(renderItem)}</ul>;
  }

  const search = (
    <SearchInput
      ref={searchRef}
      id={searchId}
      aria-label={t('overview.gallery.search')}
      placeholder={t('overview.gallery.search')}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  );
  const chipButton = (chip: (typeof chips)[number], className?: string) => (
    <FilterChip
      key={chip.id}
      label={chip.label}
      count={chip.count}
      countLabel={t('overview.gallery.chipCount', { count: chip.count })}
      size={isPhone ? 'md' : 'sm'}
      className={className}
      selected={category === chip.id}
      onToggle={() => setCategory(chip.id)}
    />
  );

  if (browse) {
    return (
      <>
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-3">
          <div className="min-w-48 flex-1">{search}</div>
          <FilterChip
            label={t('overview.gallery.notOnBoard')}
            size="md"
            selected={unusedOnly}
            onToggle={() => setUnusedOnly((on) => !on)}
          />
          <SegmentedControl
            size="md"
            label={t('overview.gallery.density')}
            value={density}
            onChange={setDensity}
            options={[
              { value: 'grid', label: t('overview.gallery.densityGrid') },
              { value: 'list', label: t('overview.gallery.densityList') },
            ]}
          />
          <Button size="md" variant="ghost" onClick={onToggleBrowse}>
            {t('overview.gallery.quickAdd')}
          </Button>
          <Button size="md" variant="primary" onClick={onDone}>
            {t('overview.gallery.done')}
          </Button>
        </div>
        {/* A rail from lg up; narrower, one row of chips above the list, as in the drawer. */}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 p-3 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          <div
            role="group"
            aria-label={t('overview.gallery.categoriesLabel')}
            className="-mx-3 flex min-w-0 gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:thin] lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {chips.map((chip) => chipButton(chip, 'shrink-0 lg:w-full lg:justify-between'))}
          </div>
          {list}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Pinned: the sheet's scroller pads its edges (hence the negative margins), the drawer's does not. */}
      <div
        className={cx(
          'sticky z-10 grid grid-cols-[minmax(0,1fr)] gap-2.5 border-b border-line bg-panel px-3 pb-2.5',
          isPhone ? '-top-3 -mx-3 -mt-3 pt-3' : 'top-0 pt-3'
        )}
      >
        {isPhone && <p className="text-xs text-text-dim">{subtitle}</p>}
        {isPhone ? (
          search
        ) : (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{search}</div>
            <Button size="md" variant="ghost" onClick={onToggleBrowse}>
              {t('overview.gallery.browseAll')}
            </Button>
          </div>
        )}
        {/* One row that scrolls sideways: a wrapped block of chips is three ragged lines. */}
        <div
          role="group"
          aria-label={t('overview.gallery.categoriesLabel')}
          className="relative -mx-3 flex min-w-0 gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:thin]"
        >
          {chips.map((chip) => chipButton(chip, 'shrink-0'))}
        </div>
      </div>
      <div className={isPhone ? 'pt-3' : 'p-3'}>{list}</div>
    </>
  );
}

export function Gallery({ open, onClose }: GalleryProps) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const board = useWidgetBoard();
  const isPhone = useIsPhone();
  const searchRef = useRef<HTMLInputElement>(null);
  // A desktop opens wide: the drawer is one press of Quick add away.
  const [browse, setBrowse] = useState(true);
  const title = t('overview.gallery.title');
  const subtitle = t(boardKey(board, 'gallery.subtitle'), {
    total: board.kinds.filter(board.canDraw).length,
    onBoard: edit.layout.widgets.length,
  });
  if (isPhone) {
    // No auto-focus on the search box here: on a phone it would raise the keyboard over the sheet.
    // The sheet covers the page, so the Undo toast and the new widget's flash would sit
    // behind it: closing on Add lets the pilot see what they added.
    return (
      <Modal open={open} onClose={onClose} title={title} placement="sheet-full">
        <GalleryBody
          isPhone
          browse={false}
          onToggleBrowse={noop}
          onDone={onClose}
          onAdded={onClose}
          searchRef={searchRef}
          subtitle={subtitle}
        />
      </Modal>
    );
  }
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      flush
      initialFocusRef={searchRef}
      maxWidthClassName={browse ? BROWSE_WIDTH : COMPACT_WIDTH}
    >
      <GalleryBody
        isPhone={false}
        browse={browse}
        onToggleBrowse={() => setBrowse((on) => !on)}
        onDone={onClose}
        onAdded={noop}
        searchRef={searchRef}
        subtitle={subtitle}
      />
    </SlideOver>
  );
}
