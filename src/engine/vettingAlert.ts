export interface VettingSharedFire {
  eventId: 'vettingShared';
  characterId: number;
  corporationId: number;
  reviewId: string;
  kind: 'application' | 'promotion';
}

export function vettingSharedPath(fire: Pick<VettingSharedFire, 'reviewId'>): string {
  return `/corp/vetting/open/${encodeURIComponent(fire.reviewId)}`;
}
