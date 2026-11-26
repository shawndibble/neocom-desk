import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import type { LibraryAction } from './FittingHeader';
import { FittingStartScreen } from './FittingStartScreen';
import { ImportFittingDialog, NewFromHullDialog } from './FittingStartDialogs';

type StartScreenProps = ComponentProps<typeof FittingStartScreen>;

interface FittingLibraryDialogsProps {
  library: LibraryAction | null;
  onClose: () => void;
  workspace: StartScreenProps['workspace'];
  catalogue: StartScreenProps['catalogue'];
  characterId: StartScreenProps['characterId'];
  inGameKey: StartScreenProps['inGameKey'];
  isPhone: boolean;
  onStartHull: (hull: HullEntry) => void;
}

export function FittingLibraryDialogs({
  library,
  onClose,
  workspace,
  catalogue,
  characterId,
  inGameKey,
  isPhone,
  onStartHull,
}: FittingLibraryDialogsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Modal
        open={library === 'open'}
        onClose={onClose}
        title={t('fittings.header.libraryTitle')}
        placement={isPhone ? 'sheet' : 'page'}
      >
        {library === 'open' && (
          <FittingStartScreen
            variant="dialog"
            preview
            workspace={workspace}
            catalogue={catalogue}
            characterId={characterId}
            inGameKey={inGameKey}
            onOpened={onClose}
          />
        )}
      </Modal>
      <NewFromHullDialog
        open={library === 'new'}
        onClose={onClose}
        catalogue={catalogue}
        onStart={(hull) => {
          onStartHull(hull);
          onClose();
        }}
        onOpenPopular={async (loaded) => {
          await workspace.openLoaded(loaded);
          onClose();
        }}
      />
      <ImportFittingDialog
        open={library === 'import'}
        onClose={onClose}
        workspace={workspace}
        onOpened={onClose}
      />
    </>
  );
}
