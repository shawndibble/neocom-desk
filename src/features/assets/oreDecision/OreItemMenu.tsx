import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { loadCompressedOreTypeIds } from '@/sde/loadSde';
import { OreDecisionDialog } from './OreDecisionDialog';

let oreTypeIds: Promise<ReadonlySet<number>> | null = null;

function loadOreTypeIds(): Promise<ReadonlySet<number>> {
  oreTypeIds ??= loadCompressedOreTypeIds().then(
    (byRaw) => new Set(Object.entries(byRaw).flat().map(Number))
  );
  return oreTypeIds;
}

function useIsOre(typeId: number): boolean {
  const [isOre, setIsOre] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadOreTypeIds()
      .then((ids) => {
        if (!cancelled) setIsOre(ids.has(typeId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [typeId]);
  return isOre;
}

export function OreItemMenu({
  quantity,
  children,
  ...menuProps
}: ComponentProps<typeof ItemContextMenu> & { quantity: number }) {
  const { t } = useTranslation();
  const isOre = useIsOre(menuProps.typeId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ItemContextMenu
        {...menuProps}
        extraItems={
          <>
            {isOre && (
              <MenuItem onSelect={() => setOpen(true)}>{t('assets.oreDecision.menu')}</MenuItem>
            )}
            {menuProps.extraItems}
          </>
        }
      >
        {children}
      </ItemContextMenu>
      {open && (
        <OreDecisionDialog
          open
          onClose={() => setOpen(false)}
          typeId={menuProps.typeId}
          itemName={menuProps.itemName}
          quantity={quantity}
        />
      )}
    </>
  );
}
