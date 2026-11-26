import { useAppStateHydration } from '@/app/appWiring';

export function PageEffects() {
  useAppStateHydration();
  return null;
}
