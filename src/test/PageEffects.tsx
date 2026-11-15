import { useAppStateHydration } from '@/app/appWiring';

/**
 * The state `App` hydrates for every page, as a component for
 * `renderPageRoutes` (`renderPage.tsx`) to mount beside its routes. A file of
 * its own so each file exports only components or only helpers (react-refresh).
 */
export function PageEffects() {
  useAppStateHydration();
  return null;
}
