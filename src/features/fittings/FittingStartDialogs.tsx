/**
 * The two ways to start a Fitting that aren't in the list: from a hull, and
 * Import. The Start screen opens them from its buttons, the open editor from
 * its Fittings menu, so both get the same dialogs.
 */
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import type { LoadedFitting } from '@/engine/fittings/load';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { FittingLoadCard } from './FittingLoadCard';
import { HullPicker } from './HullPicker';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingLibrarySource } from './useFittingPicker';

export function NewFromHullDialog({
  open,
  onClose,
  catalogue,
  onStart,
  onOpenPopular,
}: {
  open: boolean;
  onClose: () => void;
  catalogue: FittingCatalogue | null;
  onStart: (hull: HullEntry) => void;
  onOpenPopular: (loaded: LoadedFitting) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('fittings.start.newTitle')}>
      <HullPicker catalogue={catalogue} onStart={onStart} onOpenPopular={onOpenPopular} />
    </Modal>
  );
}

/** The Load card (EFT, links, killmails, EVE XML), as a bare dialog body or on its own. */
export function ImportFittingCard({
  workspace,
  onOpened,
}: {
  workspace: FittingLibrarySource;
  /** A Fitting the card listed (an EVE XML file's) was opened. */
  onOpened?: () => void;
}) {
  return (
    <FittingLoadCard
      bare
      onLoad={workspace.loadFromInput}
      lastLoad={workspace.lastLoad}
      shareError={workspace.shareError}
      tooLargeToShare={workspace.tooLargeToShare}
      onLoadFittingXmlDocument={workspace.loadFittingXmlDocument}
      onOpenLoaded={async (loaded) => {
        await workspace.openLoaded(loaded);
        onOpened?.();
      }}
    />
  );
}

export function ImportFittingDialog({
  open,
  onClose,
  workspace,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  workspace: FittingLibrarySource;
  /** A Fitting the card listed (an EVE XML file's) was opened. */
  onOpened?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('fittings.start.importButton')}>
      <ImportFittingCard workspace={workspace} onOpened={onOpened} />
    </Modal>
  );
}
