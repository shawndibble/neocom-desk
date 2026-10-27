import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { MenuItem } from '@/components/ui';
import { marketLinkParams } from '@/engine/market/urlState';
import { MarketOnly } from '@/features/abyssal/MarketOnly';

/**
 * "View in Market", keeping the page's region or hub. Own file: the light
 * contract menus (`BuildPlanContextMenu`) share it without `ItemContextMenu`.
 */
export function ViewInMarketMenuItem({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <MarketOnly typeId={typeId}>
      <MenuItem
        onSelect={() => {
          const params = marketLinkParams(typeId, location.search);
          navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
        }}
      >
        {t('market.contextMenu.viewInMarket')}
      </MenuItem>
    </MarketOnly>
  );
}
