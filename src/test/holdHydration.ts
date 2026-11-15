import type { SettingStore } from '@/lib/settingStore';
import { deferred } from './deferred';

/**
 * Puts a preference store back to unhydrated and holds its next `hydrate()`
 * until `release()`, so a test can assert what a page shows before the store
 * settles without racing a Dexie read. `restore()` puts the real `hydrate` back.
 */
export function holdHydration<T>(store: SettingStore<T>, value: T) {
  const realHydrate = store.getState().hydrate;
  const gate = deferred();
  store.setState({
    value,
    hydrated: false,
    hydrate: async () => {
      await gate.promise;
      await realHydrate();
    },
  });
  return {
    release: () => gate.resolve(),
    restore: () => store.setState({ hydrate: realHydrate }),
  };
}
