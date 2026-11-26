export interface StationBookOrder {
  is_buy_order: boolean;
  location_id: number;
  price: number;
  volume_remain: number;
}

export interface StationBook {
  sellMin: number | null;
  buyMax: number | null;
  sellVolume: number;
  buyVolume: number;
  sellOrders: number;
  buyOrders: number;
}

export function summarizeStationBook(
  orders: readonly StationBookOrder[],
  locationId: number | null
): StationBook {
  const book: StationBook = {
    sellMin: null,
    buyMax: null,
    sellVolume: 0,
    buyVolume: 0,
    sellOrders: 0,
    buyOrders: 0,
  };
  for (const order of orders) {
    if (locationId !== null && order.location_id !== locationId) continue;
    if (!Number.isFinite(order.price) || order.price <= 0) continue;
    if (order.is_buy_order) {
      book.buyOrders += 1;
      book.buyVolume += order.volume_remain;
      book.buyMax = book.buyMax === null ? order.price : Math.max(book.buyMax, order.price);
    } else {
      book.sellOrders += 1;
      book.sellVolume += order.volume_remain;
      book.sellMin = book.sellMin === null ? order.price : Math.min(book.sellMin, order.price);
    }
  }
  return book;
}
