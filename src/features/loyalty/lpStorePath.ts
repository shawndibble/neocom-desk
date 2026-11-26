export interface LpSearchCrumbState {
  from: 'lp-search';
  search: string;
}

export function lpStorePath(corporationId: number, offerId?: number): string {
  const base = `/wallet/lp-store/${corporationId}`;
  return offerId === undefined ? base : `${base}?offer=${offerId}`;
}
