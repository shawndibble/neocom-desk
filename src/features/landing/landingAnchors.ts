import { PROMO_VIDEO_ANCHOR } from './promoVideoConfig';

/**
 * The page sections the header links to, in page order: the element id and the
 * `login.header.*` key its label lives under. The same label is the section's
 * numbered eyebrow (`landingAnchor`), so a link and the band it lands on read
 * alike. Add an entry here (and the key) to add a link; the section itself
 * must carry the same `id` (`LandingSection` does).
 */
export const LANDING_ANCHORS: { id: string; key: string }[] = [
  { id: 'login-overview', key: 'overview' },
  { id: 'login-answers', key: 'answers' },
  { id: PROMO_VIDEO_ANCHOR, key: 'tour' },
  { id: 'login-features', key: 'features' },
  { id: 'login-trust', key: 'trust' },
  { id: 'login-community', key: 'community' },
  { id: 'login-faq', key: 'faq' },
];

/** Every section a URL `#hash` may land on. */
export const LANDING_SECTION_IDS: readonly string[] = LANDING_ANCHORS.map((anchor) => anchor.id);

/**
 * A section's place on the page as a two-digit console readout ("01"), from its
 * header link's position, and its `login.header.*` label key. Throws on an id
 * with no anchor, so a band can't ship unnumbered.
 */
export function landingAnchor(id: string): { index: string; key: string } {
  const index = LANDING_ANCHORS.findIndex((anchor) => anchor.id === id);
  if (index < 0) throw new Error(`no landing anchor for ${id}`);
  return { index: String(index + 1).padStart(2, '0'), key: LANDING_ANCHORS[index].key };
}
