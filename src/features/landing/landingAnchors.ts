import { PROMO_VIDEO_ANCHOR } from './promoVideoConfig';

export const LANDING_ANCHORS: { id: string; key: string }[] = [
  { id: 'login-areas', key: 'areas' },
  { id: 'login-away', key: 'away' },
  { id: PROMO_VIDEO_ANCHOR, key: 'tour' },
  { id: 'login-trust', key: 'trust' },
  { id: 'login-community', key: 'community' },
  { id: 'login-faq', key: 'faq' },
];

export const LANDING_SECTION_IDS: readonly string[] = LANDING_ANCHORS.map((anchor) => anchor.id);

export function landingAnchor(id: string): { index: string; key: string } {
  const index = LANDING_ANCHORS.findIndex((anchor) => anchor.id === id);
  if (index < 0) throw new Error(`no landing anchor for ${id}`);
  return { index: String(index + 1).padStart(2, '0'), key: LANDING_ANCHORS[index].key };
}
