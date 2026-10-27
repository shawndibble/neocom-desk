import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Toast, useTimedToast } from '@/components/ui';
import { swapModuleType } from '@/engine/fittings/fittingEdit';
import type { Fitting } from '@/engine/fittings/types';
import type { FitResource } from './makeItFitContext';
import { MakeItFitDialog } from './MakeItFitDialog';
import type { FittingView } from './fittingViewPreference';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingWorkspace } from './useFittingWorkspace';

interface UseMakeItFitDialogArgs {
  workspace: FittingWorkspace;
  /** Null on the Start screen, where there is nothing to fix. */
  fitting: Fitting | null;
  catalogue: FittingCatalogue | null;
  characterId: number | null;
  isPhone: boolean;
  view: FittingView;
  setView: (view: FittingView) => void | Promise<void>;
  edit: FittingWorkspace['edit'];
}

/**
 * Make it fit: `open(resource)` from a budget's "Fix" link, and the `dialog`
 * (with its confirmation toast) to render once in the editor.
 */
export function useMakeItFitDialog({
  workspace,
  fitting,
  catalogue,
  characterId,
  isPhone,
  view,
  setView,
  edit,
}: UseMakeItFitDialogArgs): { open: (resource: FitResource) => void; dialog: ReactNode } {
  const { t } = useTranslation();
  // Which budget's "Fix" link opened Make it fit; null while it is closed.
  const [resource, setResource] = useState<FitResource | null>(null);
  // What the last applied Make it fit option changed, for its confirmation toast.
  const [applied, setApplied] = useState<string | null>(null);
  useTimedToast(applied, () => setApplied(null));
  const open = useCallback((next: FitResource) => setResource(next), []);

  const dialog = fitting && (
    <>
      <MakeItFitDialog
        open={resource !== null}
        resource={resource}
        onClose={() => setResource(null)}
        variants={workspace.variants}
        skillGains={workspace.skillGains}
        characterId={characterId}
        fittingName={fitting.name}
        implants={
          workspace.profile
            ? {
                fitting,
                profile: workspace.profile,
                basis: workspace.implantBasis,
                onChange: workspace.setImplantSet,
              }
            : null
        }
        onImplantsApplied={(names) => {
          setResource(null);
          setApplied(t('fittings.makeItFit.implantsApplied', { names }));
        }}
        catalogue={catalogue}
        placement={isPhone ? 'sheet' : 'center'}
        onOpenList={
          view === 'list'
            ? undefined
            : () => {
                void setView('list');
                setResource(null);
              }
        }
        onApply={(option) => {
          edit((f) =>
            option.swaps.reduce(
              (acc, swap) => swapModuleType(acc, swap.slot, swap.slotIndex, swap.toTypeId),
              f
            )
          );
          setResource(null);
          setApplied(
            t('fittings.makeItFit.applied', {
              swap: option.swaps
                .map((swap) =>
                  t('fittings.makeItFit.swap', {
                    from: catalogueTypeName(catalogue, swap.fromTypeId),
                    to: catalogueTypeName(catalogue, swap.toTypeId),
                  })
                )
                .join('; '),
            })
          );
        }}
      />
      {/* No Undo here: the editor has no in-app undo, only the browser's Back (one swap is one history entry). */}
      {applied !== null && <Toast message={applied} />}
    </>
  );
  return { open, dialog };
}
