import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { permissionsForEndpoints } from '@/esi/registry';
import { useOnline } from '@/stores/network';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { fittingCompareHref } from './fittingRoutes';
import { writeCompareCodes } from './compareUrl';
import { FittingHeader, type LibraryAction } from './FittingHeader';
import { FittingSaveButton } from './FittingSaveButton';
import { LazySaveToEveDialog } from './LazySaveToEveDialog';
import { SaveAsNewDialog } from './SaveAsNewDialog';
import type { EditorShare } from './useEditorShare';
import type { FittingAlpha } from './useFittingAlpha';
import type { FittingWorkspace } from './useFittingWorkspace';
import type { useSavedFittingRecord } from './useSavedFittingRecord';
import { useDocumentTitleName } from '@/app/documentTitleName';

interface FittingEditorHeaderProps {
  workspace: FittingWorkspace;
  fitting: Fitting;
  stats: FittingStats | null;
  characterId: number | null;
  subtitle: string;
  hullName: string;
  compact: boolean;
  alpha: FittingAlpha;
  alphaInTabs?: boolean;
  share: EditorShare;
  saved: ReturnType<typeof useSavedFittingRecord>;
  onLibrary: (action: LibraryAction) => void;
  onSavedToEve: () => void;
  onImprove: () => void;
  unflyable?: boolean;
}

const SAVE_TO_EVE_GROUPS = permissionsForEndpoints(['postCharacterFitting']);

export function FittingEditorHeader({
  workspace,
  fitting,
  stats,
  characterId,
  subtitle,
  hullName,
  compact,
  alpha,
  alphaInTabs = false,
  share,
  saved: { savedRecord, currentShareCode, hasUnsavedEdits },
  onLibrary,
  onSavedToEve,
  onImprove,
  unflyable,
}: FittingEditorHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const canSaveToEve = useEndpointsGranted(['postCharacterFitting']);
  const online = useOnline();
  const [saveToEveOpen, setSaveToEveOpen] = useState(false);
  const [saveAsNewOpen, setSaveAsNewOpen] = useState(false);
  const [saveAsNewName, setSaveAsNewName] = useState('');
  useDocumentTitleName(fitting.name);

  return (
    <>
      <FittingHeader
        fitting={fitting}
        subtitle={subtitle}
        onRename={workspace.rename}
        onLibrary={onLibrary}
        onImprove={onImprove}
        unflyable={unflyable}
        onCompare={() => {
          if (hasUnsavedEdits && savedRecord && currentShareCode) {
            const params = writeCompareCodes(new URLSearchParams(), [
              savedRecord.code,
              currentShareCode,
            ]);
            navigate(fittingCompareHref(params.toString()));
            return;
          }
          navigate(fittingCompareHref(location.search));
        }}
        price={workspace.price}
        cloneImplants={workspace.profile?.implantTypeIds}
        compact={compact}
        stats={stats}
        share={share}
        badges={{
          alpha: alphaInTabs ? undefined : { blockers: alpha.blockers, skillName: alpha.skillName },
          mastery:
            characterId !== null ? { hullTypeId: fitting.shipTypeId, hullName, characterId } : null,
        }}
        save={
          <FittingSaveButton
            onSave={() => void workspace.save()}
            canSave={workspace.canSave}
            saveBlockedReason={
              characterId === null
                ? t('fittings.myFittings.needCharacter')
                : workspace.tooLargeToShare
                  ? t('fittings.myFittings.tooLarge')
                  : undefined
            }
            updating={workspace.savedId !== null}
            onSaveAsNew={() => {
              setSaveAsNewName(
                t('fittings.myFittings.saveAsNewDefaultName', {
                  name: savedRecord?.name ?? fitting.name,
                })
              );
              setSaveAsNewOpen(true);
            }}
            onSaveToEve={() => setSaveToEveOpen(true)}
            canSaveToEve={characterId !== null && canSaveToEve === true && online}
            saveToEveBlockedReason={
              characterId === null
                ? t('fittings.saveToEve.needCharacter')
                : !online
                  ? t('fittings.saveToEve.needsConnection')
                  : undefined
            }
            saveToEveMissingGroups={
              characterId !== null && canSaveToEve === false ? SAVE_TO_EVE_GROUPS : undefined
            }
          />
        }
      />
      <SaveAsNewDialog
        open={saveAsNewOpen}
        onClose={() => setSaveAsNewOpen(false)}
        name={saveAsNewName}
        onNameChange={setSaveAsNewName}
        onConfirm={(name) => void workspace.saveAsNew(name)}
      />
      {characterId !== null && saveToEveOpen && (
        <LazySaveToEveDialog
          open
          onClose={() => setSaveToEveOpen(false)}
          characterId={characterId}
          fitting={fitting}
          description={savedRecord?.notes ?? ''}
          onSaved={onSavedToEve}
          onSaveToMyFittings={workspace.savedId === null ? workspace.save : undefined}
        />
      )}
    </>
  );
}
