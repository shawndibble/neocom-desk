import { BootScreen } from './BootScreen';
import { useBootCover } from './bootCover';

/** Renders the gateless boot screen fixed over everything while the cover is shown. */
export function BootCoverHost() {
  const shown = useBootCover();
  if (!shown) return null;
  return (
    <div data-testid="boot-cover" className="fixed inset-0 z-[2147483647] overflow-auto bg-bg">
      <BootScreen />
    </div>
  );
}
