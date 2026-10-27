/**
 * Thin lazy wrapper: the Save to EVE dialog's chunk loads when a row's menu
 * first asks for it. Its own file keeps `useLibraryRowActions` Fast-Refresh-clean.
 */
import { lazy, Suspense, type ComponentProps } from 'react';
import { guarded } from '@/app/routeChunks';

const SaveToEveDialog = lazy(() =>
  guarded(() => import('./SaveToEveDialog')).then((m) => ({ default: m.SaveToEveDialog }))
);

export function LazySaveToEveDialog(props: ComponentProps<typeof SaveToEveDialog>) {
  return (
    <Suspense fallback={null}>
      <SaveToEveDialog {...props} />
    </Suspense>
  );
}
