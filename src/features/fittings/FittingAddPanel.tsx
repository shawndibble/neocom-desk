import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  FilterChip,
  IconButton,
  NativeSelect,
  RowMoreActions,
  SearchInput,
  TabPanel,
  Tabs,
  TypeIcon,
  useTabsId,
} from '@/components/ui';
import {
  disabledClassName,
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { Close, Warn } from '@/components/ui/icons';
import {
  browserTree,
  type BrowserNode,
  CANDIDATE_LIMIT,
  type CandidateEntry,
  type CandidateRack,
} from '@/engine/fittings/candidates';
import type { AddTarget } from './addTarget';
import type { Fitting, FittingModuleResult, FittingSlotKind } from '@/engine/fittings/types';
import type { VariantEvaluator } from './useFittingEvaluation';
import { useModuleAddPreview } from './useModuleAddPreview';
import { AddPreviewReadout } from './AddPreviewReadout';
import type { CandidateCheck } from './dogmaFittingEngine';
import { AddItemMenuItems, FittingItemMenu } from './FittingItemMenu';
import { endFittingDrag, startFittingDrag } from './fittingDrag';
import { useFittingItemActions } from './fittingItemActions';
import type { FittingContext } from './fittingContext';
import { useHullFit } from './useHullFit';
import { CatalogueLoadingNote, ShipDataWaitingNote } from './FittingDataNotices';
import type { FittingCatalogue } from './useFittingCatalogue';
import { ChargesTab } from './AddChargesTab';
import { CargoTab } from './AddCargoTab';

type BrowserTab = 'modules' | 'charges' | 'drones' | 'cargo';

interface FittingAddPanelProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  target: AddTarget | null;
  /** The engine, pilot and catalogue for fit checks; null while any of them loads. */
  context: FittingContext | null;
  onAdd: (typeId: number, rack: CandidateRack) => void;
  /** Drops the chosen slot, so the browser shows every rack again. */
  onClearTarget?: () => void;
  /** Index-parallel to `fitting.modules` — which charges each fitted module takes. */
  moduleResults?: FittingModuleResult[] | null;
  /** The Charges tab: load a charge into every fitted module that takes it. */
  onLoadCharge?: (chargeTypeId: number) => void;
  /** The Cargo tab: puts `quantity` of any item in the hold. */
  onAddCargo?: (typeId: number, quantity: number) => void;
  /** Items drag onto the Ring's slots and the List's racks (pointer only — scope decision `20260924-205720`). */
  dragToRing?: boolean;
  /** The hull takes drones (`showsDrones`) — else there is no Drones tab. */
  showDrones?: boolean;
  /** How many more of a drone the bay holds; absent before the ship data. */
  droneRoomFor?: (typeId: number) => number;
  /** Whether the rack has a slot a click would fill (a chosen slot counts); absent before the ship data. */
  slotFreeFor?: (rack: FittingSlotKind) => boolean;
  /**
   * Hover/focus a Modules row to preview the whole-Fitting change of adding
   * it. Absent (no evaluator yet, or a touch device — nothing about the
   * editor changes there) turns the preview off.
   */
  preview?: {
    variants: VariantEvaluator | null;
    /** The Fitting with the module added where a click would put it; null when a click adds nothing. */
    build: (fitting: Fitting, typeId: number, rack: CandidateRack) => Fitting | null;
  };
}

const RACK_LABEL_KEY: Record<CandidateRack, string> = {
  high: 'fittings.add.rack.high',
  medium: 'fittings.add.rack.medium',
  low: 'fittings.add.rack.low',
  rig: 'fittings.add.rack.rig',
  subsystem: 'fittings.add.rack.subsystem',
  drone: 'fittings.add.rack.drone',
};

/** The in-game Fitting window's three icon toggles, in their on-screen order. */
type FitFilterKind = 'hull' | 'resources' | 'skills';
const FIT_FILTER_KINDS: readonly FitFilterKind[] = ['hull', 'resources', 'skills'];

/**
 * The icon and i18n keys for each toggle — CCP's own in-game art (scope
 * decision `20260927-104252`), copied from the EVE University wiki into
 * `public/images/fitting/` rather than linked.
 */
const FIT_FILTERS: readonly {
  kind: FitFilterKind;
  icon: string;
  labelKey: string;
  tooltipKey: string;
}[] = [
  {
    kind: 'hull',
    icon: '/images/fitting/hull.png',
    labelKey: 'fittings.add.filterHull',
    tooltipKey: 'fittings.add.filterHullTooltip',
  },
  {
    kind: 'resources',
    icon: '/images/fitting/resource.png',
    labelKey: 'fittings.add.filterResources',
    tooltipKey: 'fittings.add.filterResourcesTooltip',
  },
  {
    kind: 'skills',
    icon: '/images/fitting/skill.png',
    labelKey: 'fittings.add.filterSkills',
    tooltipKey: 'fittings.add.filterSkillsTooltip',
  },
];

/**
 * The in-game fitting window's rack icons, from the EVE University wiki.
 * Subsystems have none, so theirs stays a text chip.
 */
const SLOT_ICONS: Partial<Record<FittingSlotKind, string>> = {
  high: '/images/fitting/slot-high.png',
  medium: '/images/fitting/slot-medium.png',
  low: '/images/fitting/slot-low.png',
  rig: '/images/fitting/slot-rig.png',
};

interface BrowseFilterOptions {
  tab: BrowserTab;
  /** Only this rack — the chosen slot's, with "fits this slot" on. */
  slotRack: CandidateRack | null;
  metaGroupId: number | null;
  /** Null until the hull check is done; then only what fits it. */
  hullFit: ReadonlyMap<number, CandidateCheck> | null;
  /** Which of the three icon filters are currently on. */
  fitFilters: ReadonlySet<FitFilterKind>;
}

/** Whether a market item belongs in the browser under the current tab, slot and filters. */
function browseFilter(
  catalogue: FittingCatalogue,
  { tab, slotRack, metaGroupId, hullFit, fitFilters }: BrowseFilterOptions
): (entry: CandidateEntry) => boolean {
  return (entry) => {
    const rack = catalogue.rackOf[String(entry.typeId)];
    if (rack === undefined) return false;
    if (tab === 'drones' ? rack !== 'drone' : rack === 'drone') return false;
    if (slotRack !== null && rack !== slotRack) return false;
    if (
      metaGroupId !== null &&
      (catalogue.variations.types[entry.typeId]?.metaGroupId ?? null) !== metaGroupId
    )
      return false;
    if (hullFit !== null) {
      const check = hullFit.get(entry.typeId);
      // Each icon toggle hides on its own rule: the hull's rack rules, its
      // bare CPU/powergrid/calibration, or the pilot's skills.
      if (fitFilters.has('hull') && !check?.fitsHull) return false;
      if (fitFilters.has('resources') && !check?.fitsResources) return false;
      if (fitFilters.has('skills') && !check?.canFly) return false;
    }
    return true;
  };
}

interface ItemRowProps {
  entry: CandidateEntry;
  rack: CandidateRack;
  check: CandidateCheck | null;
  placeable: boolean;
  /** Why this can't go on the ship, in plain words — a yellow triangle beside the row tells them. */
  problems: string[];
  /** A click would add nothing (no bay room, no free slot): the row is greyed. */
  blocked: boolean;
  draggable: boolean;
  onAdd: (typeId: number, rack: CandidateRack) => void;
  /** Hover or focus on the row sets it; leaving or blurring clears (null). */
  onPreview?: (typeId: number | null) => void;
}

function ItemRow({
  entry,
  rack,
  placeable,
  problems,
  blocked,
  draggable,
  onAdd,
  onPreview,
}: ItemRowProps) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const touched = useRef(false);
  const row = (
    <li
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => startFittingDrag(event, { kind: 'type', typeId: entry.typeId, rack })
          : undefined
      }
      onDragEnd={draggable ? endFittingDrag : undefined}
      onPointerEnter={
        onPreview
          ? (event) => {
              if (event.pointerType !== 'touch') onPreview(entry.typeId);
            }
          : undefined
      }
      onPointerLeave={onPreview ? () => onPreview(null) : undefined}
      onPointerDown={
        onPreview ? (event) => (touched.current = event.pointerType === 'touch') : undefined
      }
      onKeyDown={onPreview ? () => (touched.current = false) : undefined}
      // A tap focuses the row too, and touch gets no preview.
      onFocus={onPreview ? () => !touched.current && onPreview(entry.typeId) : undefined}
      onBlur={onPreview ? () => onPreview(null) : undefined}
      className={`flex items-center ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <button
        type="button"
        // aria-disabled, not disabled: adding into the last free slot greys the
        // row while it holds focus, and a native disabled button drops it.
        aria-disabled={!placeable || blocked || undefined}
        onClick={() => {
          if (placeable && !blocked) onAdd(entry.typeId, rack);
        }}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 px-2 text-left text-xs md:min-h-9',
          rowInteractiveClassName,
          focusRingInsetClassName,
          disabledClassName
        )}
      >
        <TypeIcon typeId={entry.typeId} size={32} width={24} height={24} />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </button>
      {problems.length > 0 && (
        <IconButton
          variant="plain"
          size="row"
          tone="warning"
          openOnTap
          icon={<Warn />}
          label={t('fittings.add.cantAdd', { reasons: problems.join('; ') })}
        />
      )}
      {actions && <RowMoreActions />}
    </li>
  );
  return actions ? (
    <FittingItemMenu
      name={entry.name}
      items={<AddItemMenuItems typeId={entry.typeId} rack={rack} />}
    >
      {row}
    </FittingItemMenu>
  ) : (
    row
  );
}

/**
 * The module browser (scope decision `20260924-215855`, mockup A): Modules,
 * Charges and Drones tabs; with a slot chosen, a banner naming it. Browsing
 * lists only the market groups holding something that fits the open ship —
 * every fittable item is checked against the hull once (`useHullFit`) — and
 * the chosen slot; a search lists matches straight. Items click to add, or
 * drag onto the Ring. The Charges tab loads a charge into every fitted
 * module that takes it.
 */
export function FittingAddPanel({
  fitting,
  catalogue,
  target,
  context,
  onAdd,
  onClearTarget,
  moduleResults,
  onLoadCharge,
  onAddCargo,
  dragToRing = false,
  showDrones = true,
  droneRoomFor,
  slotFreeFor,
  preview,
}: FittingAddPanelProps) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [query, setQuery] = useState('');
  const [fitsSlot, setFitsSlot] = useState(true);
  // The three in-game icon toggles (hull, resources, skills) — all on by
  // default, so the result list starts exactly as restrictive as before they existed.
  const [fitFilters, setFitFilters] = useState<ReadonlySet<FitFilterKind>>(
    () => new Set(FIT_FILTER_KINDS)
  );
  const toggleFitFilter = (kind: FitFilterKind) =>
    setFitFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const [metaGroupId, setMetaGroupId] = useState<number | null>(null);
  const [toggled, setToggled] = useState<ReadonlySet<number>>(new Set());

  // The tab follows the target (a drone target opens Drones), until the pilot picks one.
  const targetTab: BrowserTab =
    target?.kind === 'drone' ? 'drones' : target?.kind === 'cargo' ? 'cargo' : 'modules';
  const [pickedTab, setPickedTab] = useState<BrowserTab>(targetTab);
  const tab: BrowserTab = pickedTab === 'drones' && !showDrones ? 'modules' : pickedTab;
  const [tabFor, setTabFor] = useState(target);
  if (tabFor !== target) {
    setTabFor(target);
    if (target !== null) setPickedTab(targetTab);
  }

  const hullFit = useHullFit(context, fitting.shipTypeId);
  const [previewTypeId, setPreviewTypeId] = useState<number | null>(null);
  const addPreview = useModuleAddPreview({
    variants: preview?.variants ?? null,
    typeId: tab === 'modules' ? previewTypeId : null,
    build: (f, typeId) => {
      const rack = catalogue?.rackOf[String(typeId)];
      return rack ? (preview?.build(f, typeId, rack as CandidateRack) ?? null) : null;
    },
    checkFor: (typeId) => hullFit?.get(typeId) ?? null,
  });
  const slotRack = target?.kind === 'slot' && fitsSlot ? target.slot : null;
  const slotIcon = target?.kind === 'slot' ? SLOT_ICONS[target.slot] : undefined;
  const toggleFitsSlot = () => setFitsSlot((on) => !on);

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    // Once the ship data is in, a search waits for the hull check as browsing
    // does, rather than briefly offering structure modules and the like.
    if (catalogue === null || trimmed === '' || (context !== null && hullFit === null)) return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, fitFilters });
    return catalogue.marketTypes
      .filter((entry) => include(entry) && entry.name.toLowerCase().includes(trimmed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  }, [catalogue, trimmed, context, tab, slotRack, metaGroupId, hullFit, fitFilters]);
  // Browsing needs the hull check: without it the tree would be every
  // fittable item in the game, structure modules and all.
  const tree = useMemo(() => {
    if (catalogue === null || hullFit === null || trimmed !== '') return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, fitFilters });
    return browserTree(catalogue.marketTypes, include, catalogue.groupsById);
  }, [catalogue, trimmed, tab, slotRack, metaGroupId, hullFit, fitFilters]);
  // What Resources and Skills are hiding for this search/browse: the items
  // that pass Hull (as it currently stands) and every other filter but not
  // one of those two. Hull stays fixed here — the market is mostly things
  // that don't fit this hull at all, so counting past it would name numbers
  // in the thousands and the note would stop being useful.
  const relaxed = useMemo(() => {
    const next = new Set(fitFilters);
    next.delete('resources');
    next.delete('skills');
    return next;
  }, [fitFilters]);
  const searchRef = useRef<HTMLInputElement>(null);
  const hiddenByFilters = useMemo(() => {
    if (catalogue === null || hullFit === null || relaxed.size === fitFilters.size) return 0;
    const base = { tab, slotRack, metaGroupId, hullFit };
    const shown = browseFilter(catalogue, { ...base, fitFilters });
    const all = browseFilter(catalogue, { ...base, fitFilters: relaxed });
    return catalogue.marketTypes.filter(
      (entry) => all(entry) && !shown(entry) && entry.name.toLowerCase().includes(trimmed)
    ).length;
  }, [catalogue, trimmed, tab, slotRack, metaGroupId, hullFit, fitFilters, relaxed]);
  const hiddenNote =
    hiddenByFilters > 0 ? (
      <button
        type="button"
        className={`${inlineLinkClassName} min-h-11 text-left text-xs md:min-h-9`}
        onClick={() => {
          setFitFilters(relaxed);
          // This button goes away with the filters it lifts; focus follows to the search.
          searchRef.current?.focus();
        }}
      >
        {t('fittings.add.hiddenByFilters', { count: hiddenByFilters })}
      </button>
    ) : null;
  // The market roots ("Ship Equipment", …) are a click nobody needs: the
  // browser starts at their categories, as the game's does. A few categories
  // (a chosen slot narrows it this far) start open; a click flips any node.
  const top = tree
    .flatMap((node) =>
      node.items.length === 0 && node.children.length > 0 ? node.children : [node]
    )
    .sort((a, b) => a.label.localeCompare(b.label));
  const openTop = top.length <= 4;
  const isOpen = (node: BrowserNode<CandidateEntry>, depth: number) =>
    (depth === 0 && openTop) !== toggled.has(node.id);
  const toggle = (id: number) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function branch(node: BrowserNode<CandidateEntry>, depth: number) {
    const open = isOpen(node, depth);
    return (
      <li key={node.id}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => toggle(node.id)}
          className={cx(
            'flex min-h-11 w-full items-center gap-2 px-1 text-left text-xs md:min-h-9',
            rowInteractiveClassName,
            focusRingInsetClassName,
            depth === 0 && 'font-semibold'
          )}
        >
          <Caret expanded={open} />
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
          <span className="shrink-0 font-normal text-text-dim tabular-nums">{node.count}</span>
        </button>
        {open && (
          <ul className="pl-3">
            {node.children.map((child) => branch(child, depth + 1))}
            {node.items.map(row)}
          </ul>
        )}
      </li>
    );
  }

  const metaGroups = useMemo(
    () =>
      catalogue === null
        ? []
        : Object.entries(catalogue.variations.metaGroups)
            .map(([id, name]) => ({ id: Number(id), name }))
            .sort((a, b) => a.id - b.id),
    [catalogue]
  );

  function row(entry: CandidateEntry) {
    const rack = catalogue!.rackOf[String(entry.typeId)];
    const check = hullFit?.get(entry.typeId) ?? null;
    // The Hull filter can be off, so a row the hull refuses outright can be
    // on screen — it stays visible (asked for, in that case) but never addable.
    const fitsHull = check?.fitsHull !== false;
    const noRoom =
      rack === 'drone'
        ? droneRoomFor?.(entry.typeId) === 0
        : slotFreeFor?.(rack as FittingSlotKind) === false;
    const problems: string[] = [];
    if (!fitsHull) problems.push(t('fittings.add.doesntFitHull'));
    else if (check?.fitsResources === false) problems.push(t('fittings.add.noResources'));
    if (check?.canFly === false) problems.push(t('fittings.add.missingSkills'));
    if (noRoom)
      problems.push(
        rack === 'drone'
          ? t('fittings.add.noBayRoom')
          : t('fittings.add.noSlotRoom', { rack: t(`fittings.add.rack.${rack}`) })
      );
    return (
      <ItemRow
        key={entry.typeId}
        entry={entry}
        rack={rack}
        check={check}
        // Not gated on a free slot: a full rack's item still drags into the cargo
        // (or onto a slot, replacing it); a click with no room adds nothing.
        placeable={fitsHull && context !== null}
        problems={problems}
        blocked={noRoom}
        draggable={fitsHull && dragToRing && context !== null}
        onAdd={onAdd}
        onPreview={preview && tab === 'modules' ? setPreviewTypeId : undefined}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Tabs
        tabsId={tabsId}
        tabs={[
          { id: 'modules', label: t('fittings.add.tab.modules') },
          { id: 'charges', label: t('fittings.add.tab.charges') },
          ...(showDrones ? [{ id: 'drones', label: t('fittings.add.tab.drones') }] : []),
          ...(onAddCargo ? [{ id: 'cargo', label: t('fittings.add.tab.cargo') }] : []),
        ]}
        value={tab}
        onChange={(id) => setPickedTab(id as BrowserTab)}
        label={t('fittings.add.tabsLabel')}
      />

      <TabPanel tabsId={tabsId} tabId={tab} className="space-y-2">
        {target?.kind === 'slot' && tab === 'modules' && (
          <div className="flex items-center justify-between gap-2 rounded-xs border border-accent-dim bg-panel-2 px-2 py-1 text-xs">
            <span>
              {t('fittings.add.addingTo', {
                slot: t(RACK_LABEL_KEY[target.slot]),
                index: target.slotIndex + 1,
              })}
            </span>
            {onClearTarget && (
              <IconButton
                icon={<Close />}
                size="sm"
                label={t('fittings.add.clearTarget')}
                onClick={onClearTarget}
              />
            )}
          </div>
        )}

        {tab === 'charges' ? (
          <ChargesTab
            fitting={fitting}
            catalogue={catalogue}
            context={context}
            moduleResults={moduleResults ?? null}
            onLoadCharge={onLoadCharge}
            dragToFit={dragToRing}
          />
        ) : tab === 'cargo' && onAddCargo ? (
          <CargoTab catalogue={catalogue} cargo={fitting.cargo} onAddCargo={onAddCargo} />
        ) : (
          <>
            <SearchInput
              ref={searchRef}
              aria-label={t('fittings.add.searchLabel')}
              placeholder={t('fittings.add.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {slotIcon ? (
                <IconButton
                  icon={<img src={slotIcon} alt="" width={16} height={16} />}
                  label={t('fittings.add.fitsSlot')}
                  tooltip={t('fittings.add.fitsSlotTooltip')}
                  size="sm"
                  pressed={fitsSlot}
                  onClick={toggleFitsSlot}
                />
              ) : (
                target?.kind === 'slot' && (
                  <FilterChip
                    label={t('fittings.add.fitsSlot')}
                    selected={fitsSlot}
                    tooltip={t('fittings.add.fitsSlotTooltip')}
                    onToggle={toggleFitsSlot}
                  />
                )
              )}
              <div className="flex items-center gap-1">
                {FIT_FILTERS.map(({ kind, icon, labelKey, tooltipKey }) => (
                  <IconButton
                    key={kind}
                    icon={<img src={icon} alt="" width={16} height={16} />}
                    label={t(labelKey)}
                    tooltip={t(tooltipKey)}
                    size="sm"
                    pressed={fitFilters.has(kind) && hullFit !== null}
                    disabled={hullFit === null}
                    onClick={() => toggleFitFilter(kind)}
                  />
                ))}
              </div>
              <NativeSelect
                size="sm"
                aria-label={t('fittings.add.metaLabel')}
                value={metaGroupId ?? ''}
                onChange={(event) =>
                  setMetaGroupId(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">{t('fittings.add.metaAny')}</option>
                {metaGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {context === null && <ShipDataWaitingNote />}
            {context !== null && hullFit === null && (
              <p className="text-xs text-text-dim">{t('fittings.add.checkingHull')}</p>
            )}
            {dragToRing && tab === 'modules' && hullFit !== null && (
              <p className="text-xs text-text-dim">{t('fittings.add.dragHint')}</p>
            )}

            {catalogue === null ? (
              <CatalogueLoadingNote />
            ) : trimmed !== '' ? (
              results.length === 0 ? (
                <>
                  <p className="text-xs text-text-dim">{t('fittings.add.noResults')}</p>
                  {hiddenNote}
                </>
              ) : (
                <>
                  <ul>{results.map(row)}</ul>
                  {hiddenNote}
                </>
              )
            ) : hullFit !== null && tree.length === 0 ? (
              <>
                <p className="text-xs text-text-dim">{t('fittings.add.noResults')}</p>
                {hiddenNote}
              </>
            ) : (
              <>
                <ul>{top.map((node) => branch(node, 0))}</ul>
                {hiddenNote}
              </>
            )}
            {addPreview && (
              <AddPreviewReadout
                preview={addPreview}
                name={catalogue?.types[String(addPreview.typeId)]?.name ?? `#${addPreview.typeId}`}
              />
            )}
          </>
        )}
      </TabPanel>
    </div>
  );
}
