import { lazy, Suspense, useEffect } from 'react';
import { guarded } from '@/app/routeChunks';
import { isApplePlatform, isCommandPaletteShortcut } from '@/lib/shortcuts';
import { useCommandPalette } from './store';

const APPLE = isApplePlatform();

const loadCommandPalette = () => guarded(() => import('./CommandPalette'));
const CommandPalette = lazy(() =>
  loadCommandPalette().then((module) => ({ default: module.CommandPalette }))
);

export function CommandPaletteHost() {
  const open = useCommandPalette((state) => state.open);
  const hide = useCommandPalette((state) => state.hide);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isCommandPaletteShortcut(event, APPLE)) return;
      event.preventDefault();
      void loadCommandPalette().catch(() => {});
      const { open, toggle } = useCommandPalette.getState();
      if (!open && document.querySelector('dialog[open]')) return;
      toggle();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => useCommandPalette.getState().hide(), []);

  return (
    <>
      {open && (
        <Suspense fallback={null}>
          <CommandPalette onClose={hide} />
        </Suspense>
      )}
    </>
  );
}
