import { useRef, useState } from 'react';
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
  type BrowserNode,
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
import {
  FIT_FILTER_KINDS,
  useAddPanelResults,
  type BrowserTab,
  type FitFilterKind,
} from './useAddPanelResults';

interface FittingAddPanelProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  target: AddTarget | null;
  context: FittingContext | null;
  onAdd: (typeId: number, rack: CandidateRack) => void;
  onClearTarget?: () => void;
  moduleResults?: FittingModuleResult[] | null;
  onLoadCharge?: (chargeTypeId: number) => void;
  onAddCargo?: (typeId: number, quantity: number) => void;
  dragToRing?: boolean;
  showDrones?: boolean;
  droneRoomFor?: (typeId: number) => number;
  slotFreeFor?: (rack: FittingSlotKind) => boolean;
  preview?: {
    variants: VariantEvaluator | null;
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

const SLOT_ICONS: Partial<Record<FittingSlotKind, string>> = {
  high: '/images/fitting/slot-high.png',
  medium: '/images/fitting/slot-medium.png',
  low: '/images/fitting/slot-low.png',
  rig: '/images/fitting/slot-rig.png',
};

interface ItemRowProps {
  entry: CandidateEntry;
  rack: CandidateRack;
  check: CandidateCheck | null;
  placeable: boolean;
  problems: string[];
  blocked: boolean;
  draggable: boolean;
  onAdd: (typeId: number, rack: CandidateRack) => void;
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
      onFocus={onPreview ? () => !touched.current && onPreview(entry.typeId) : undefined}
      onBlur={onPreview ? () => onPreview(null) : undefined}
      className={`flex items-center ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <button
        type="button"
        aria-disabled={!placeable || blocked || undefined}
        onClick={() => {
          if (placeable && !blocked) onAdd(entry.typeId, rack);
        }}
        className={cx(
          'flex min-h-9 w-full items-center gap-2 px-2 text-left text-xs',
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
  const { results, tree, relaxed, hiddenByFilters, metaGroups } = useAddPanelResults({
    catalogue,
    trimmed,
    context,
    tab,
    slotRack,
    metaGroupId,
    hullFit,
    fitFilters,
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const hiddenNote =
    hiddenByFilters > 0 ? (
      <button
        type="button"
        className={`${inlineLinkClassName} min-h-9 text-left text-xs`}
        onClick={() => {
          setFitFilters(relaxed);
          searchRef.current?.focus();
        }}
      >
        {t('fittings.add.hiddenByFilters', { count: hiddenByFilters })}
      </button>
    ) : null;
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
            'flex min-h-9 w-full items-center gap-2 px-1 text-left text-xs',
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

  function row(entry: CandidateEntry) {
    const rack = catalogue!.rackOf[String(entry.typeId)];
    const check = hullFit?.get(entry.typeId) ?? null;
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
