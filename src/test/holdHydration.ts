import type { SettingStore } from '@/lib/settingStore';
import { deferred } from './deferred';

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
