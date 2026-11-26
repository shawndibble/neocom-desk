import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import type { TrainedSkill } from '@/engine/types';
import { ImportClipboardDialog } from '../ImportClipboardDialog';
import type { usePlanImport } from './usePlanImport';

export function PlanImportDialogs({
  imports,
  nameFor,
  trainedSkills,
  planEntryCount,
}: {
  imports: ReturnType<typeof usePlanImport>;
  nameFor: (skillTypeID: number) => string;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  planEntryCount: number;
}) {
  const { t } = useTranslation();
  const {
    importOpen,
    applyTextImport,
    replaceTextImport,
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
          onReplace={planEntryCount > 0 ? replaceTextImport : undefined}
          onClose={closeImportDialog}
          initialText={importSeed ?? undefined}
          initialPreview={importPreview}
          nameFor={nameFor}
          trainedSkills={trainedSkills}
        />
      )}

      <Modal
        open={pendingQueueImport !== null}
        onClose={() => setPendingQueueImport(null)}
        title={t('plans.importQueueChoiceTitle')}
      >
        <p className="text-xs text-text-dim">
          {t('plans.importQueueChoiceBody', { count: pendingQueueImport?.length ?? 0 })}
        </p>
        <div className="mt-2 flex gap-2">
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
