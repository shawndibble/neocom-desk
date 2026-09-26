/**
 * The Fitting editor's one item menu: every fitted module, empty slot, drone,
 * cargo item and Add panel item offers its actions through it, on the Ring
 * and the List alike. Built on the app's `RowActionsMenu`, so each gets the
 * right-click menu, Radix's own touch-and-hold for it, and — where the row
 * has room — a visible "More actions" (⋮) button a keyboard or touch user
 * reaches the same items with (WCAG 2.1.1). Every drag in the editor has its
 * equivalent here.
 *
 * The page owns the edits and hands them down once, as `FittingItemActions`
 * in context; a surface without it (the Start screen's read-only preview)
 * simply shows no menu.
 */
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  RowActionsMenu,
} from '@/components/ui';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { reachableModuleStates } from '@/engine/fittings/fittingEdit';
import type { FittingItemState, FittingModule, FittingSlotKind } from '@/engine/fittings/types';
import { ShowInfoMenuItem, ViewInMarketMenuItem } from '@/features/market/ItemContextMenu';
import { useFittingItemActions, type FittingItemActions } from './fittingItemActions';

/**
 * Wraps a trigger in the item menu: right-click (or touch-and-hold) opens
 * `items`, and a `RowMoreActions` anywhere under it draws the ⋮ button.
 *
 * With `tooltip`, the trigger explains itself on hover and focus too (a Ring
 * tile). Touch-and-hold then belongs to the menu alone, so the menu is
 * touch's way to what the tile holds (`RowActionsMenu`'s own `tooltip`).
 */
export function FittingItemMenu({
  name,
  items,
  tooltip,
  onOpenChange,
  children,
}: {
  /** What the item is, for the ⋮ button's name ("More actions for …"). */
  name: string;
  items: ReactNode;
  tooltip?: string;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}) {
  return (
    <RowActionsMenu name={name} items={items} tooltip={tooltip} onOpenChange={onOpenChange}>
      {children}
    </RowActionsMenu>
  );
}

function slotName(t: ReturnType<typeof useTranslation>['t'], rack: FittingSlotKind, index: number) {
  return t('fittings.item.slot', { rack: t(`fittings.list.rack.${rack}`), index: index + 1 });
}

/** Load charge ▸ (from cargo) and "Load into all compatible", for one module. */
function ModuleChargeItems({
  actions,
  module,
}: {
  actions: FittingItemActions;
  module: FittingModule;
}) {
  const { t } = useTranslation();
  const inCargo = actions.charges.cargoChargesFor(module);
  return (
    <MenuSub>
      <MenuSubTrigger disabled={inCargo.length === 0}>
        {inCargo.length === 0 ? t('fittings.item.noCargoCharge') : t('fittings.item.loadCharge')}
      </MenuSubTrigger>
      <MenuSubContent>
        {inCargo.map((chargeTypeId) => (
          <MenuSub key={chargeTypeId}>
            <MenuSubTrigger>{actions.typeName(chargeTypeId)}</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem
                onSelect={() =>
                  actions.charges.load(chargeTypeId, { fromCargo: true, only: module })
                }
              >
                {t('fittings.item.loadThisOne')}
              </MenuItem>
              <MenuItem onSelect={() => actions.charges.load(chargeTypeId, { fromCargo: true })}>
                {t('fittings.item.loadAllCompatible')}
              </MenuItem>
            </MenuSubContent>
          </MenuSub>
        ))}
      </MenuSubContent>
    </MenuSub>
  );
}

/** A fitted module's actions — the Ring tile, the List row, the module dialog. */
export function ModuleMenuItems({
  module,
  shownState,
  maxState,
  withMove = false,
}: {
  module: FittingModule;
  /** The state it reached (what the radio ticks). */
  shownState: FittingItemState;
  /** The highest it can reach; every state until known. */
  maxState?: FittingItemState;
  /** Move up / down / to slot — the List's keyboard and touch way to reorder. */
  withMove?: boolean;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const variants = useMemo(
    () => actions?.variantsOf(module.typeId) ?? [],
    [actions, module.typeId]
  );
  if (actions === null) return null;
  const { slot: rack, slotIndex: index, typeId } = module;
  const name = actions.typeName(typeId);
  const count = actions.slotCount(rack);
  // A subsystem can't be put offline, so its menu has no states to pick.
  const hasStates = rack !== 'subsystem';
  return (
    <>
      {hasStates && (
        <MenuSub>
          <MenuSubTrigger>{t('fittings.item.state')}</MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup
              value={shownState}
              onValueChange={(value) => actions.setState(rack, index, value as FittingItemState)}
            >
              {reachableModuleStates(maxState ?? 'overload', shownState).map((option) => (
                <MenuRadioItem key={option} value={option}>
                  {t(`fittings.ring.menu.state.${option}`)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
      )}
      <ModuleChargeItems actions={actions} module={module} />
      {module.chargeTypeId !== undefined && (
        <>
          <MenuItem
            onSelect={() => actions.charges.load(module.chargeTypeId!, { fromCargo: false })}
          >
            {t('fittings.item.sameChargeEverywhere', {
              name: actions.typeName(module.chargeTypeId),
            })}
          </MenuItem>
          <MenuItem onSelect={() => actions.unloadCharge(rack, index)}>
            {t('fittings.ring.menu.unload', { name: actions.typeName(module.chargeTypeId) })}
          </MenuItem>
        </>
      )}
      <MenuSeparator />
      <MenuItem onSelect={() => actions.copyToAllOfType(rack, index)}>
        {t('fittings.item.copyToAllOfType')}
      </MenuItem>
      <MenuSub>
        <MenuSubTrigger disabled={variants.length === 0}>
          {t('fittings.item.swapVariant')}
        </MenuSubTrigger>
        <MenuSubContent className="max-h-80 overflow-y-auto">
          {variants.map((variant) => (
            <MenuItem
              key={variant.typeId}
              onSelect={() => actions.swapType(rack, index, variant.typeId)}
            >
              {variant.name}
            </MenuItem>
          ))}
        </MenuSubContent>
      </MenuSub>
      <MenuItem onSelect={() => actions.copyModule(module)}>
        {t('fittings.item.copyModule')}
      </MenuItem>
      {withMove && count !== null && (
        <>
          <MenuItem disabled={index === 0} onSelect={() => actions.move(rack, index, index - 1)}>
            {t('fittings.item.moveUp')}
          </MenuItem>
          <MenuItem
            disabled={index >= count - 1}
            onSelect={() => actions.move(rack, index, index + 1)}
          >
            {t('fittings.item.moveDown')}
          </MenuItem>
          <MenuSub>
            <MenuSubTrigger disabled={count < 2}>{t('fittings.item.moveTo')}</MenuSubTrigger>
            <MenuSubContent>
              {Array.from({ length: count }, (_, to) => to)
                .filter((to) => to !== index)
                .map((to) => (
                  <MenuItem key={to} onSelect={() => actions.move(rack, index, to)}>
                    {slotName(t, rack, to)}
                  </MenuItem>
                ))}
            </MenuSubContent>
          </MenuSub>
        </>
      )}
      <MenuSeparator />
      <ShowInfoMenuItem typeId={typeId} itemName={name} onShowInfo={actions.showInfo} />
      <ViewInMarketMenuItem typeId={typeId} />
      <MenuSeparator />
      <MenuItem onSelect={() => actions.removeAllOfType(typeId)}>
        {t('fittings.item.removeAllOfType')}
      </MenuItem>
      <MenuItem className="text-danger" onSelect={() => actions.remove(rack, index)}>
        {t('fittings.ring.menu.remove', { name })}
      </MenuItem>
    </>
  );
}

/**
 * A weapon group's charge choices: what the cargo holds that it takes
 * (loaded out of the hold), then every other charge it takes (the hold left
 * alone, as the Add panel's Charges tab does). Not the one it holds now.
 */
function ChangeChargeItems({
  actions,
  module,
  at,
}: {
  actions: FittingItemActions;
  module: FittingModule;
  at: readonly { slot: FittingSlotKind; slotIndex: number }[];
}) {
  const { t } = useTranslation();
  const current = module.chargeTypeId;
  const inCargo = actions.charges.cargoChargesFor(module).filter((id) => id !== current);
  const others = actions.chargesFor(module).filter((id) => id !== current && !inCargo.includes(id));
  if (inCargo.length === 0 && others.length === 0) {
    return <MenuItem disabled>{t('fittings.item.noCharges')}</MenuItem>;
  }
  const item = (chargeTypeId: number, fromCargo: boolean) => (
    <MenuItem
      key={chargeTypeId}
      onSelect={() => actions.charges.load(chargeTypeId, { fromCargo, only: at })}
    >
      {actions.typeName(chargeTypeId)}
    </MenuItem>
  );
  return (
    <>
      {inCargo.map((id) => item(id, true))}
      {inCargo.length > 0 && others.length > 0 && <MenuSeparator />}
      {others.map((id) => item(id, false))}
    </>
  );
}

/**
 * A weapon group's actions — a stats Offense row, every module of one type
 * holding one charge: change the charge they hold (from cargo), their state,
 * and what the weapon is. Each is one edit for the whole group.
 */
export function WeaponMenuItems({
  modules,
  shownState,
  maxState,
}: {
  /** The group's modules — one type, one charge. */
  modules: readonly FittingModule[];
  /** The state they share; undefined when they differ, so the radio ticks nothing. */
  shownState?: FittingItemState;
  /** The highest they can reach; every state until known. */
  maxState?: FittingItemState;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const first = modules[0];
  if (actions === null || first === undefined) return null;
  const at = modules.map(({ slot, slotIndex }) => ({ slot, slotIndex }));
  const name = actions.typeName(first.typeId);
  return (
    <>
      <MenuSub>
        <MenuSubTrigger>{t('fittings.item.changeCharge')}</MenuSubTrigger>
        <MenuSubContent className="max-h-80 overflow-y-auto">
          {/* Its own component, so the engine is only asked once the submenu opens. */}
          <ChangeChargeItems actions={actions} module={first} at={at} />
        </MenuSubContent>
      </MenuSub>
      {first.chargeTypeId !== undefined && (
        <MenuItem onSelect={() => actions.unloadGroup(at)}>
          {t('fittings.ring.menu.unload', { name: actions.typeName(first.chargeTypeId) })}
        </MenuItem>
      )}
      {first.slot !== 'subsystem' && (
        <MenuSub>
          <MenuSubTrigger>{t('fittings.item.state')}</MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup
              value={shownState ?? ''}
              onValueChange={(value) => actions.setGroupState(at, value as FittingItemState)}
            >
              {reachableModuleStates(maxState ?? 'overload', shownState ?? 'offline').map(
                (option) => (
                  <MenuRadioItem key={option} value={option}>
                    {t(`fittings.ring.menu.state.${option}`)}
                  </MenuRadioItem>
                )
              )}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
      )}
      <MenuSeparator />
      <ShowInfoMenuItem typeId={first.typeId} itemName={name} onShowInfo={actions.showInfo} />
      <ViewInMarketMenuItem typeId={first.typeId} />
    </>
  );
}

/** An empty slot's actions: something recent, the copied module, a whole rack of the last one. */
export function EmptySlotMenuItems({ rack, index }: { rack: FittingSlotKind; index: number }) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  if (actions === null) return null;
  const recent = actions.recentFor(rack);
  const copied = actions.clipboardFor(rack);
  const last = recent[0];
  return (
    <>
      <MenuSub>
        <MenuSubTrigger>{t('fittings.item.addModule')}</MenuSubTrigger>
        <MenuSubContent>
          {recent.map((typeId) => (
            <MenuItem key={typeId} onSelect={() => actions.addModule(rack, index, typeId)}>
              {actions.typeName(typeId)}
            </MenuItem>
          ))}
          {recent.length > 0 && <MenuSeparator />}
          <MenuItem onSelect={() => actions.browseFor(rack, index)}>
            {t('fittings.item.browse')}
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
      <MenuItem
        disabled={copied === null}
        onSelect={() => copied !== null && actions.addModule(rack, index, copied)}
      >
        {copied === null
          ? t('fittings.item.pasteNone')
          : t('fittings.item.paste', { name: actions.typeName(copied) })}
      </MenuItem>
      <MenuItem
        disabled={last === undefined}
        onSelect={() => last !== undefined && actions.fillRack(rack, last)}
      >
        {last === undefined
          ? t('fittings.item.fillRackNone')
          : t('fittings.item.fillRack', { name: actions.typeName(last) })}
      </MenuItem>
    </>
  );
}

/** A drone type's actions. */
export function DroneMenuItems({
  typeId,
  inSpace,
  inBay,
}: {
  typeId: number;
  inSpace: number;
  inBay: number;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  if (actions === null) return null;
  const name = actions.typeName(typeId);
  return (
    <>
      <MenuItem disabled={inBay === 0} onSelect={() => actions.launchDrones(typeId)}>
        {t('fittings.item.launchAll')}
      </MenuItem>
      <MenuItem disabled={inSpace === 0} onSelect={() => actions.recallDrones(typeId)}>
        {t('fittings.item.moveToBay')}
      </MenuItem>
      <MenuItem onSelect={() => actions.recallAllDrones()}>{t('fittings.item.recallAll')}</MenuItem>
      <MenuSeparator />
      <ShowInfoMenuItem typeId={typeId} itemName={name} onShowInfo={actions.showInfo} />
      <ViewInMarketMenuItem typeId={typeId} />
      <MenuSeparator />
      <MenuItem className="text-danger" onSelect={() => actions.removeDrones(typeId)}>
        {t('fittings.ring.menu.remove', { name })}
      </MenuItem>
    </>
  );
}

/** "Load into all compatible" and "Load into… ▸" for a charge, from cargo or not. */
function ChargeLoadItems({
  actions,
  typeId,
  fromCargo,
}: {
  actions: FittingItemActions;
  typeId: number;
  fromCargo: boolean;
}) {
  const { t } = useTranslation();
  const targets = actions.charges.targetsFor(typeId);
  return (
    <>
      <MenuItem
        disabled={targets.length === 0}
        onSelect={() => actions.charges.load(typeId, { fromCargo })}
      >
        {targets.length === 0
          ? t('fittings.item.noneTakes')
          : t('fittings.item.loadAllCompatibleCount', { count: targets.length })}
      </MenuItem>
      {targets.length > 0 && (
        <MenuSub>
          <MenuSubTrigger>{t('fittings.item.loadInto')}</MenuSubTrigger>
          <MenuSubContent>
            {targets.map((key) => {
              const [rack, at] = key.split('-') as [FittingSlotKind, string];
              const index = Number(at);
              return (
                <MenuItem
                  key={key}
                  onSelect={() =>
                    actions.charges.load(typeId, {
                      fromCargo,
                      only: { slot: rack, slotIndex: index },
                    })
                  }
                >
                  {slotName(t, rack, index)}
                </MenuItem>
              );
            })}
          </MenuSubContent>
        </MenuSub>
      )}
    </>
  );
}

/** A cargo item's actions. */
export function CargoMenuItems({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  if (actions === null) return null;
  const name = actions.typeName(typeId);
  return (
    <>
      <ChargeLoadItems actions={actions} typeId={typeId} fromCargo />
      <MenuItem onSelect={() => actions.changeCargoQuantity(typeId)}>
        {t('fittings.item.changeQuantity')}
      </MenuItem>
      <MenuSeparator />
      <ShowInfoMenuItem typeId={typeId} itemName={name} onShowInfo={actions.showInfo} />
      <ViewInMarketMenuItem typeId={typeId} />
      <MenuSeparator />
      <MenuItem className="text-danger" onSelect={() => actions.removeCargo(typeId)}>
        {t('fittings.ring.menu.remove', { name })}
      </MenuItem>
    </>
  );
}

/** An Add panel item's actions: a module or drone fits, a charge loads. */
export function AddItemMenuItems({
  typeId,
  rack,
}: {
  typeId: number;
  /** Where it fits; undefined for a charge. */
  rack?: CandidateRack;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  if (actions === null) return null;
  const name = actions.typeName(typeId);
  return (
    <>
      {rack !== undefined ? (
        <MenuItem
          disabled={!actions.canFitFirstFree(typeId, rack)}
          onSelect={() => actions.fitFirstFree(typeId, rack)}
        >
          {rack === 'drone' ? t('fittings.item.addToBay') : t('fittings.item.fitFirstFree')}
        </MenuItem>
      ) : (
        <ChargeLoadItems actions={actions} typeId={typeId} fromCargo={false} />
      )}
      <MenuSeparator />
      <ShowInfoMenuItem typeId={typeId} itemName={name} onShowInfo={actions.showInfo} />
      <ViewInMarketMenuItem typeId={typeId} />
    </>
  );
}
