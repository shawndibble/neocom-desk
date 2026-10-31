/** What the store view reads from the location state to draw its crumb back to the landing. */
export interface LpSearchCrumbState {
  from: 'lp-search';
  q: string;
  /** The landing's whole query string (view, search, filters), so Close rebuilds the view. */
  search?: string;
}

export function lpStorePath(corporationId: number, offerId?: number): string {
  const base = `/wallet/lp-store/${corporationId}`;
  return offerId === undefined ? base : `${base}?offer=${offerId}`;
}
