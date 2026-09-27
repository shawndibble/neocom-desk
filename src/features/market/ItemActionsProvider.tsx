import type { ReactNode } from 'react';
import type { OrderBookLocation } from './orderBookView';
import { ItemActionsContext } from './itemActions';
import { ItemDetailModal } from './ItemDetailModal';
import type { PageItemActions } from './usePageItemActions';

/**
 * Provides a page's Item Actions to everything under it, and renders the
 * page's one Item Detail modal that Show info opens.
 */
export function ItemActionsProvider({
  page,
  detailLocation,
  children,
}: {
  page: PageItemActions;
  /** Where the modal prices the item — the Market Browser's own location; other pages leave it out. */
  detailLocation?: OrderBookLocation;
  children: ReactNode;
}) {
  const { actions, shown, closeInfo } = page;
  return (
    <ItemActionsContext.Provider value={actions}>
      {children}
      {shown && (
        <ItemDetailModal
          typeId={shown.typeId}
          itemName={shown.itemName}
          location={detailLocation}
          onClose={closeInfo}
        />
      )}
    </ItemActionsContext.Provider>
  );
}
