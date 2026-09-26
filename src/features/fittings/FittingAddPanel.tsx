import { useMemo, useState } from 'react';
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
import { checkCharges, type CandidateCheck } from './dogmaFittingEngine';
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

interface BrowseFilterOptions {
  tab: BrowserTab;
  /** Only this rack — the chosen slot's, with "fits this slot" on. */
  slotRack: CandidateRack | null;
  metaGroupId: number | null;
  /** Null until the hull check is done; then only what fits it. */
  hullFit: ReadonlyMap<number, CandidateCheck> | null;
  canFlyOnly: boolean;
}

/** Whether a market item belongs in the browser under the current tab, slot and filters. */
function browseFilter(
  catalogue: FittingCatalogue,
  { tab, slotRack, metaGroupId, hullFit, canFlyOnly }: BrowseFilterOptions
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
      // Modules the ship can't take — by the hull's rules, or too big for its
      // CPU / powergrid / calibration even with nothing else fitted — never show.
      if (!check?.fitsHull || !check.fitsResources || (canFlyOnly && !check.canFly)) return false;
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
        {check !== null && !check.canFly && (
          <span className="shrink-0 text-[0.6875rem] text-warning">
            {t('fittings.add.missingSkills')}
          </span>
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
  const [canFlyOnly, setCanFlyOnly] = useState(true);
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

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    // Once the ship data is in, a search waits for the hull check as browsing
    // does, rather than briefly offering structure modules and the like.
    if (catalogue === null || trimmed === '' || (engineReady && hullFit === null)) return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, canFlyOnly });
    return catalogue.marketTypes
      .filter((entry) => include(entry) && entry.name.toLowerCase().includes(trimmed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  }, [catalogue, trimmed, engineReady, tab, slotRack, metaGroupId, hullFit, canFlyOnly]);
  // Browsing needs the hull check: without it the tree would be every
  // fittable item in the game, structure modules and all.
  const tree = useMemo(() => {
    if (catalogue === null || hullFit === null || trimmed !== '') return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, canFlyOnly });
    return browserTree(catalogue.marketTypes, include, catalogue.groupsById);
  }, [catalogue, trimmed, tab, slotRack, metaGroupId, hullFit, canFlyOnly]);
  // What "Can fly" is hiding for this search/browse: the items that pass every
  // other filter but not the skills one. Nothing to count once it's off.
  const hiddenByCanFly = useMemo(() => {
    if (catalogue === null || hullFit === null || !canFlyOnly) return 0;
    const base = { tab, slotRack, metaGroupId, hullFit };
    const shown = browseFilter(catalogue, { ...base, canFlyOnly: true });
    const all = browseFilter(catalogue, { ...base, canFlyOnly: false });
    return catalogue.marketTypes.filter(
      (entry) => all(entry) && !shown(entry) && entry.name.toLowerCase().includes(trimmed)
    ).length;
  }, [catalogue, trimmed, tab, slotRack, metaGroupId, hullFit, canFlyOnly]);
  const hiddenNote =
    hiddenByCanFly > 0 ? (
      <button
        type="button"
        className="min-h-11 text-left text-xs text-accent underline-offset-2 hover:underline md:min-h-9"
        onClick={() => setCanFlyOnly(false)}
      >
        {t('fittings.add.hiddenByCanFly', { count: hiddenByCanFly })}
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
    return (
      <ItemRow
        key={entry.typeId}
        entry={entry}
        rack={rack}
        check={hullFit?.get(entry.typeId) ?? null}
        placeable={engineReady && canPlace(rack, entry.typeId)}
        draggable={dragToRing && engineReady}
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
            {target?.kind === 'slot' && (
              <FilterChip
                label={t('fittings.add.fitsSlot')}
                selected={fitsSlot}
                tooltip={t('fittings.add.fitsSlotTooltip')}
                onToggle={() => setFitsSlot((on) => !on)}
              />
            )}
            <FilterChip
              label={t('fittings.add.canFly')}
              selected={canFlyOnly && hullFit !== null}
              disabled={hullFit === null}
              tooltip={t('fittings.add.canFlyTooltip')}
              onToggle={() => setCanFlyOnly((on) => !on)}
            />
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

/** Per fitted module type that takes charges: what it has loaded, and every charge it takes. */
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
  const weapons = useMemo(() => {
    if (moduleResults === null) return [];
    const byType = new Map<
      number,
      {
        typeId: number;
        slot: FittingSlotKind;
        count: number;
        groups: number[];
        loaded: Set<number>;
      }
    >();
    fitting.modules.forEach((module, index) => {
      const groups = moduleResults[index]?.chargeGroupIds ?? [];
      if (groups.length === 0) return;
      const entry = byType.get(module.typeId) ?? {
        typeId: module.typeId,
        slot: module.slot,
        count: 0,
        groups,
        loaded: new Set<number>(),
      };
      entry.count += 1;
      if (module.chargeTypeId !== undefined) entry.loaded.add(module.chargeTypeId);
      byType.set(module.typeId, entry);
    });
    return [...byType.values()];
  }, [fitting.modules, moduleResults]);

  const options = useMemo(() => {
    const map = new Map<number, number[]>();
    if (catalogue === null || !engineReady || profile === null) return map;
    for (const weapon of weapons) {
      const candidates = weapon.groups.flatMap((id) => catalogue.typeIdsByGroup.get(id) ?? []);
      const fits = checkCharges(
        fitting.shipTypeId,
        { slot: weapon.slot, typeId: weapon.typeId },
        candidates,
        profile
      );
      map.set(
        weapon.typeId,
        candidates
          .filter((id) => fits.has(id) && catalogue.types[String(id)] !== undefined)
          .sort((a, b) =>
            (catalogue.types[String(a)]?.name ?? '').localeCompare(
              catalogue.types[String(b)]?.name ?? ''
            )
          )
      );
    }
    return map;
  }, [catalogue, engineReady, profile, weapons, fitting.shipTypeId]);

  const name = (typeId: number) => catalogue?.types[String(typeId)]?.name ?? `#${typeId}`;

  if (moduleResults === null || !engineReady) {
    return <p className="text-xs text-warning">{t('fittings.add.waitingForShipData')}</p>;
  }
  if (weapons.length === 0) {
    return <p className="text-xs text-text-dim">{t('fittings.add.noChargeTakers')}</p>;
  }
  return (
    <div className="space-y-3">
      {weapons.map((weapon) => (
        <section key={weapon.typeId} className="space-y-1">
          <h3 className="flex items-center gap-2 text-xs font-semibold">
            <TypeIcon typeId={weapon.typeId} size={32} width={20} height={20} />
            <span className="min-w-0 flex-1 truncate">
              {t('fittings.add.chargeTaker', { count: weapon.count, name: name(weapon.typeId) })}
            </span>
          </h3>
          <ul>
            {(options.get(weapon.typeId) ?? []).map((chargeTypeId) => {
              const loaded = weapon.loaded.has(chargeTypeId);
              const draggable = dragToFit && actions !== null;
              const row = (
                <li
                  key={chargeTypeId}
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
                  <button
                    type="button"
                    aria-pressed={loaded}
                    disabled={!onLoadCharge}
                    onClick={() => onLoadCharge?.(chargeTypeId)}
                    className={`flex min-h-11 w-full items-center gap-2 border-l-2 px-2 text-left text-xs hover:bg-panel-2 md:min-h-9 ${loaded ? 'border-accent text-accent' : 'border-transparent'}`}
                  >
                    <TypeIcon typeId={chargeTypeId} size={32} width={20} height={20} />
                    <span className="min-w-0 flex-1 truncate">{name(chargeTypeId)}</span>
                    {loaded && (
                      <span className="shrink-0 text-[0.6875rem]">{t('fittings.add.loaded')}</span>
                    )}
                  </button>
                  {actions && <RowMoreActions />}
                </li>
              );
              return actions ? (
                <FittingItemMenu
                  key={chargeTypeId}
                  name={name(chargeTypeId)}
                  items={<AddItemMenuItems typeId={chargeTypeId} />}
                >
                  {row}
                </FittingItemMenu>
              ) : (
                row
              );
            })}
          </ul>
        </section>
      ))}
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
