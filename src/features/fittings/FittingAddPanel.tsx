import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  FilterChip,
  IconButton,
  NativeSelect,
  RowMoreActions,
  SearchInput,
  Tabs,
  TextInput,
  TypeIcon,
} from '@/components/ui';
import { Close } from '@/components/ui/icons';
import {
  browserTree,
  type BrowserNode,
  CANDIDATE_LIMIT,
  type CandidateEntry,
  type CandidateRack,
} from '@/engine/fittings/candidates';
import type { AddTarget } from './addTarget';
import type {
  Fitting,
  FittingModuleResult,
  FittingSlotKind,
  PilotProfile,
} from '@/engine/fittings/types';
import type { CandidateCheck } from './dogmaFittingEngine';
import { CapBoosterGuide } from './CapBoosterGuide';
import { ChargePickerControls, ChargePickerGroup } from './ChargePicker';
import { DEFAULT_PICKER_SETTINGS, type ChargePickerSettings } from './chargePickerSettings';
import { useChargeChoices } from './useChargeChoices';
import { endFittingDrag, startFittingDrag } from './fittingDrag';
import { AddCargoMenuItems, AddItemMenuItems, FittingItemMenu } from './FittingItemMenu';
import { useFittingItemActions } from './fittingItemActions';
import { useHullFit } from './useHullFit';
import type { FittingCatalogue } from './useFittingCatalogue';

type BrowserTab = 'modules' | 'charges' | 'drones' | 'cargo';

interface FittingAddPanelProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  target: AddTarget | null;
  /** Ship data (dogma engine) loaded — slot and fit checks can run. */
  engineReady: boolean;
  profile: PilotProfile | null;
  /** Whether this item (of this rack) has somewhere to go right now — a free slot, or room in the drone bay. */
  canPlace: (rack: CandidateRack, typeId: number) => boolean;
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
  draggable: boolean;
  onAdd: (typeId: number, rack: CandidateRack) => void;
}

function ItemRow({ entry, rack, check, placeable, draggable, onAdd }: ItemRowProps) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const row = (
    <li
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => startFittingDrag(event, { kind: 'type', typeId: entry.typeId, rack })
          : undefined
      }
      onDragEnd={draggable ? endFittingDrag : undefined}
      className={`flex items-center ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <button
        type="button"
        disabled={!placeable}
        onClick={() => onAdd(entry.typeId, rack)}
        className="flex min-h-11 w-full items-center gap-2 px-2 text-left text-xs hover:bg-panel-2 disabled:opacity-40 md:min-h-9"
      >
        <TypeIcon typeId={entry.typeId} size={32} width={24} height={24} />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        {check?.fitsHull === false ? (
          <span className="shrink-0 text-[0.6875rem] text-warning">
            {t('fittings.add.doesntFitHull')}
          </span>
        ) : (
          check !== null &&
          !check.canFly && (
            <span className="shrink-0 text-[0.6875rem] text-warning">
              {t('fittings.add.missingSkills')}
            </span>
          )
        )}
      </button>
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
  engineReady,
  profile,
  canPlace,
  onAdd,
  onClearTarget,
  moduleResults,
  onLoadCharge,
  onAddCargo,
  dragToRing = false,
  showDrones = true,
}: FittingAddPanelProps) {
  const { t } = useTranslation();
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

  const hullFit = useHullFit(catalogue, fitting.shipTypeId, profile, engineReady);
  const slotRack = target?.kind === 'slot' && fitsSlot ? target.slot : null;
  const slotIcon = target?.kind === 'slot' ? SLOT_ICONS[target.slot] : undefined;
  const toggleFitsSlot = () => setFitsSlot((on) => !on);

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    // Once the ship data is in, a search waits for the hull check as browsing
    // does, rather than briefly offering structure modules and the like.
    if (catalogue === null || trimmed === '' || (engineReady && hullFit === null)) return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, fitFilters });
    return catalogue.marketTypes
      .filter((entry) => include(entry) && entry.name.toLowerCase().includes(trimmed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  }, [catalogue, trimmed, engineReady, tab, slotRack, metaGroupId, hullFit, fitFilters]);
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
        className="min-h-11 text-left text-xs text-accent underline-offset-2 hover:underline md:min-h-9"
        onClick={() => setFitFilters(relaxed)}
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
          className={`flex min-h-11 w-full items-center gap-2 px-1 text-left text-xs hover:bg-panel-2 md:min-h-9 ${depth === 0 ? 'font-semibold' : ''}`}
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
    return (
      <ItemRow
        key={entry.typeId}
        entry={entry}
        rack={rack}
        check={check}
        placeable={fitsHull && engineReady && canPlace(rack, entry.typeId)}
        draggable={fitsHull && dragToRing && engineReady}
        onAdd={onAdd}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Tabs
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
          engineReady={engineReady}
          profile={profile}
          moduleResults={moduleResults ?? null}
          onLoadCharge={onLoadCharge}
          dragToFit={dragToRing}
        />
      ) : tab === 'cargo' && onAddCargo ? (
        <CargoTab catalogue={catalogue} cargo={fitting.cargo} onAddCargo={onAddCargo} />
      ) : (
        <>
          <SearchInput
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

          {!engineReady && (
            <p className="text-xs text-warning">{t('fittings.add.waitingForShipData')}</p>
          )}
          {engineReady && hullFit === null && (
            <p className="text-xs text-text-dim">{t('fittings.add.checkingHull')}</p>
          )}
          {dragToRing && tab === 'modules' && hullFit !== null && (
            <p className="text-xs text-text-dim">{t('fittings.add.dragHint')}</p>
          )}

          {catalogue === null ? (
            <p className="text-xs text-text-dim">{t('fittings.add.loadingCatalogue')}</p>
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
        </>
      )}
    </div>
  );
}

interface ChargesTabProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  engineReady: boolean;
  profile: PilotProfile | null;
  moduleResults: FittingModuleResult[] | null;
  onLoadCharge?: (chargeTypeId: number) => void;
  /** A charge drags onto the modules that take it. */
  dragToFit: boolean;
}

/**
 * Per fitted module type that takes charges: for a weapon, the Charge
 * Picker (grouped by type or faction, with this Fitting's damage, range and
 * the hub's price); for a cap booster, its guide (how the capacitor fares on
 * each charge, GJ/s, ISK per GJ); for anything else (scripts, paste), the
 * plain list of what it takes. Each module's section collapses under its
 * header, which then names the charge loaded in it.
 */
function ChargesTab({
  fitting,
  catalogue,
  engineReady,
  profile,
  moduleResults,
  onLoadCharge,
  dragToFit,
}: ChargesTabProps) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const [settings, setSettings] = useState<ChargePickerSettings>(DEFAULT_PICKER_SETTINGS);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const sectionId = useId();
  const toggleSection = (moduleTypeId: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(moduleTypeId)) next.add(moduleTypeId);
      return next;
    });
  const { groups, pricesLoading } = useChargeChoices({
    fitting,
    catalogue,
    engineReady,
    profile,
    moduleResults,
  });

  const name = (typeId: number) => catalogue?.types[String(typeId)]?.name ?? `#${typeId}`;

  /** The Add panel's own row behaviour around any loadable charge: drag onto the modules that take it, right-click menu. */
  const wrapRow = (chargeTypeId: number, row: ReactNode) => {
    const draggable = dragToFit && actions !== null;
    const inner = (
      <div
        className="flex items-center"
        draggable={draggable}
        onDragStart={
          draggable
            ? (event) =>
                startFittingDrag(event, {
                  kind: 'charge',
                  typeId: chargeTypeId,
                  fromCargo: false,
                  targets: actions.charges.targetsFor(chargeTypeId),
                })
            : undefined
        }
        onDragEnd={draggable ? endFittingDrag : undefined}
      >
        <div className="min-w-0 flex-1">{row}</div>
        {actions && <RowMoreActions />}
      </div>
    );
    return actions ? (
      <FittingItemMenu name={name(chargeTypeId)} items={<AddItemMenuItems typeId={chargeTypeId} />}>
        {inner}
      </FittingItemMenu>
    ) : (
      inner
    );
  };

  if (moduleResults === null || !engineReady || groups === null) {
    return <p className="text-xs text-warning">{t('fittings.add.waitingForShipData')}</p>;
  }
  if (groups.length === 0) {
    return <p className="text-xs text-text-dim">{t('fittings.add.noChargeTakers')}</p>;
  }
  const weaponChoices = groups.filter((g) => g.isWeapon).flatMap((g) => g.choices);
  // The shared View/Sort/distance controls go with the weapon sections they drive.
  const anyWeaponOpen = groups.some((g) => g.isWeapon && !collapsed.has(g.moduleTypeId));
  const maxKm = Math.ceil(
    (Math.max(0, ...weaponChoices.map((c) => c.optimal + c.falloff)) / 1000) * 1.2
  );
  return (
    <div className="space-y-3">
      {weaponChoices.length > 0 && anyWeaponOpen && (
        <ChargePickerControls settings={settings} onChange={setSettings} maxKm={maxKm} />
      )}
      {groups.map((group) => {
        const open = !collapsed.has(group.moduleTypeId);
        const bodyId = `${sectionId}-${group.moduleTypeId}`;
        const loadedNames = [...group.loaded].map(name).join(', ');
        return (
          <section key={group.moduleTypeId} className="space-y-1">
            <h3 className="text-xs font-semibold">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => toggleSection(group.moduleTypeId)}
                className="flex min-h-11 w-full items-center gap-2 px-2 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-9"
              >
                <Caret expanded={open} />
                <TypeIcon typeId={group.moduleTypeId} size={32} width={20} height={20} />
                <span className="min-w-0 flex-1 truncate">
                  {t('fittings.add.chargeTaker', {
                    count: group.count,
                    name: name(group.moduleTypeId),
                  })}
                </span>
                {/* The name always carries what's loaded, so it reads the same open or shut. */}
                {loadedNames !== '' && (
                  <span className="sr-only">
                    {t('fittings.add.chargeTakerLoaded', { names: loadedNames })}
                  </span>
                )}
                {!open && loadedNames !== '' && (
                  <span
                    aria-hidden="true"
                    className="max-w-40 shrink-0 truncate font-normal text-text-dim"
                  >
                    {loadedNames}
                  </span>
                )}
              </button>
            </h3>
            {/* Hidden rather than unmounted, so a type opened inside stays open. */}
            <div id={bodyId} hidden={!open}>
              {group.isCapBooster ? (
                <CapBoosterGuide
                  group={group}
                  onLoad={onLoadCharge}
                  wrapRow={wrapRow}
                  pricesLoading={pricesLoading}
                />
              ) : group.isWeapon ? (
                <ChargePickerGroup
                  group={group}
                  settings={settings}
                  onLoad={onLoadCharge}
                  wrapRow={wrapRow}
                  pricesLoading={pricesLoading}
                />
              ) : (
                <ul>
                  {group.choices.map((choice) => {
                    const loaded = group.loaded.has(choice.typeId);
                    return (
                      <li key={choice.typeId}>
                        {wrapRow(
                          choice.typeId,
                          <button
                            type="button"
                            aria-pressed={loaded}
                            disabled={!onLoadCharge}
                            onClick={() => onLoadCharge?.(choice.typeId)}
                            className={`flex min-h-11 w-full items-center gap-2 border-l-2 px-2 text-left text-xs hover:bg-panel-2 md:min-h-9 ${loaded ? 'border-accent text-accent' : 'border-transparent'}`}
                          >
                            <TypeIcon typeId={choice.typeId} size={32} width={20} height={20} />
                            <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                            {loaded && (
                              <span className="shrink-0 text-[0.6875rem]">
                                {t('fittings.add.loaded')}
                              </span>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Add cargo: any market item, found by name, in the quantity asked — the
 * hold takes what the ring has no slot for (ammo, paste, filaments, a depot).
 */
function CargoTab({
  catalogue,
  cargo,
  onAddCargo,
}: {
  catalogue: FittingCatalogue | null;
  /** What the hold already carries: those results get the List cargo row's menu. */
  cargo: Fitting['cargo'];
  onAddCargo: (typeId: number, quantity: number) => void;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const inHold = useMemo(() => new Set(cargo.map((item) => item.typeId)), [cargo]);
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState('1');
  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (catalogue === null || trimmed === '') return [];
    return catalogue.marketTypes
      .filter((entry) => entry.name.toLowerCase().includes(trimmed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  }, [catalogue, trimmed]);
  const count = Math.floor(Number(quantity));
  const valid = Number.isFinite(count) && count >= 1;
  return (
    <div className="space-y-2">
      <SearchInput
        aria-label={t('fittings.add.cargoSearchLabel')}
        placeholder={t('fittings.add.cargoSearchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="flex items-center gap-2 text-xs text-text-dim">
        {t('fittings.edit.quantity')}
        <TextInput
          type="number"
          min={1}
          size="sm"
          className="w-24"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      {catalogue === null ? (
        <p className="text-xs text-text-dim">{t('fittings.add.loadingCatalogue')}</p>
      ) : trimmed === '' ? (
        <p className="text-xs text-text-dim">{t('fittings.add.cargoHint')}</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.add.noResults')}</p>
      ) : (
        <ul>
          {results.map((entry) => {
            const row = (
              <li key={entry.typeId} className="flex items-center">
                <button
                  type="button"
                  disabled={!valid}
                  onClick={() => onAddCargo(entry.typeId, count)}
                  className="flex min-h-11 w-full items-center gap-2 px-2 text-left text-xs hover:bg-panel-2 disabled:opacity-40 md:min-h-9"
                >
                  <TypeIcon typeId={entry.typeId} size={32} width={24} height={24} />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="shrink-0 text-text-dim tabular-nums">
                    {t('fittings.add.cargoAddCount', { count: valid ? count : 0 })}
                  </span>
                </button>
                {actions && <RowMoreActions />}
              </li>
            );
            return actions ? (
              <FittingItemMenu
                key={entry.typeId}
                name={entry.name}
                items={
                  <AddCargoMenuItems
                    typeId={entry.typeId}
                    count={valid ? count : 0}
                    inHold={inHold.has(entry.typeId)}
                    onAddCargo={onAddCargo}
                  />
                }
              >
                {row}
              </FittingItemMenu>
            ) : (
              row
            );
          })}
        </ul>
      )}
    </div>
  );
}
