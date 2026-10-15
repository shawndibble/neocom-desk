/**
 * The page sections the header links to: the element id and the `login.header.*`
 * key its label lives under. Add an entry here (and the key) to add a link;
 * the section itself must carry the same `id` (`LandingSection` does).
 */
export const LANDING_ANCHORS: { id: string; key: string }[] = [
  { id: 'login-answers', key: 'answers' },
  { id: 'login-features', key: 'features' },
  { id: 'login-trust', key: 'trust' },
  { id: 'login-community', key: 'community' },
  { id: 'login-faq', key: 'faq' },
];
