import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '@/components/ui';
import type { FittingSlotKind } from '@/engine/fittings/types';
import { OpenInEveItemMenuItems, ShowInfoMenuItem } from '@/features/market/ItemContextMenu';
import { ViewInMarketMenuItem } from '@/features/market/ViewInMarketMenuItem';
import { useFittingItemActions } from '../fittingItemActions';

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
      {actions.openImprove && (
        <MenuItem onSelect={actions.openImprove}>{t('fittings.improve.menuItem')}</MenuItem>
      )}
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
      <ShowInfoMenuItem typeId={typeId} itemName={name} />
      <OpenInEveItemMenuItems typeId={typeId} />
      <ViewInMarketMenuItem typeId={typeId} />
      <MenuSeparator />
      <MenuItem className="text-danger" onSelect={() => actions.removeDrones(typeId)}>
        {t('fittings.ring.menu.remove', { name })}
      </MenuItem>
    </>
  );
}
