/**
 * The key each merged All read files a row's corporation under (`corporationOf`), once: the
 * loaders merge with it (`corpFeedLoaders.ts`) and `corpNarrow.ts` narrows with it, so the two
 * cannot drift apart and quietly empty a widget on one corporation.
 */
export const customsOfficeKey = (office: { office_id: number }) => String(office.office_id);
export const starbaseKey = (row: { starbaseId: number }) => String(row.starbaseId);
export const sovereigntyRowKey = (row: { key: string }) => row.key;
export const contractKey = (contract: { contract_id: number }) => String(contract.contract_id);
export const orderKey = (order: { order_id: number }) => String(order.order_id);
