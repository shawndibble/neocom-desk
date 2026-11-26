import type { ReactNode } from 'react';
import type { OrderBookLocation } from './orderBookView';
import { ItemActionsContext } from './itemActions';
import { ItemDetailModal } from './ItemDetailModal';
import type { PageItemActions } from './usePageItemActions';

export function ItemActionsProvider({
  page,
  detailLocation,
  children,
}: {
  page: PageItemActions;
  detailLocation?: OrderBookLocation;
  children: ReactNode;
}) {
  const { actions, shown, closeInfo } = page;
  return (
    <ItemActionsContext.Provider value={actions}>
      {children}
      {shown && (
        <ItemDetailModal
          key={`${shown.typeId}-${shown.itemId ?? ''}`}
          typeId={shown.typeId}
          itemId={shown.itemId}
          itemName={shown.itemName}
          location={detailLocation}
          showOpenInMarket={detailLocation === undefined}
          onClose={closeInfo}
        />
      )}
    </ItemActionsContext.Provider>
  );
}
