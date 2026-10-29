import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import type { TrainedSkill } from '@/engine/types';
import { ImportClipboardDialog } from '../ImportClipboardDialog';
import type { usePlanImport } from './usePlanImport';

/** The two import surfaces: the paste/file dialog, and the Append-or-Replace choice for an in-game queue import. */
export function PlanImportDialogs({
  imports,
  nameFor,
  trainedSkills,
}: {
  imports: ReturnType<typeof usePlanImport>;
  nameFor: (skillTypeID: number) => string;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
}) {
  const { t } = useTranslation();
  const {
    importOpen,
    applyTextImport,
    closeImportDialog,
    importSeed,
    importPreview,
    pendingQueueImport,
    setPendingQueueImport,
    confirmQueueImportAppend,
    confirmQueueImportReplace,
  } = imports;
  return (
    <>
      {importOpen && (
        <ImportClipboardDialog
          onApply={applyTextImport}
          onClose={closeImportDialog}
          initialText={importSeed ?? undefined}
          initialPreview={importPreview}
          nameFor={nameFor}
          trainedSkills={trainedSkills}
        />
      )}

      {/* Queue import into a non-empty plan (#1402): neither choice applies
          until the user picks one, so an empty or paused in-game queue can
          never silently wipe a plan someone spent an hour building. */}
      <Modal
        open={pendingQueueImport !== null}
        onClose={() => setPendingQueueImport(null)}
        title={t('plans.importQueueChoiceTitle')}
      >
        <p className="text-xs text-text-dim">
          {t('plans.importQueueChoiceBody', { count: pendingQueueImport?.length ?? 0 })}
        </p>
        <div className="mt-2 flex gap-2">
          {/* md, not this file's usual sm-in-a-Modal: the ticket calls out the
              36px touch floor by name for this Modal specifically. */}
          <Button variant="primary" size="md" onClick={confirmQueueImportAppend}>
            {t('plans.importQueueAppend')}
          </Button>
          <Button variant="danger" size="md" onClick={confirmQueueImportReplace}>
            {t('plans.importQueueReplace')}
          </Button>
          <Button size="md" onClick={() => setPendingQueueImport(null)}>
            {t('plans.importCancel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
