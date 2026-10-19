import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, Modal } from '@/components/ui';
import type { FittingSlotKind } from '@/engine/fittings/types';
import { FittingAffectedByPanel } from '@/features/fittings/FittingAffectedByPanel';
import { ModuleRow } from '@/features/fittings/FittingModuleRow';
import { FittingMutationPanel } from '@/features/fittings/FittingMutationPanel';
import { FittingVariationsPanel } from '@/features/fittings/FittingVariationsPanel';
import { catalogueTypeName } from '@/features/fittings/useFittingCatalogue';

type RowProps = ComponentProps<typeof ModuleRow>;

interface FittingModuleDialogProps {
  /** The fitted module whose dialog is open; null while it is closed. */
  module: RowProps['module'] | null;
  moduleIndex: number;
  /** Rack named in the title while `module` is null (the closing frame). */
  fallbackSlot: FittingSlotKind;
  onClose: () => void;
  placement: ComponentProps<typeof Modal>['placement'];
  result: RowProps['result'];
  cantUse: boolean;
  fitting: RowProps['fitting'];
  catalogue: RowProps['catalogue'];
  context: RowProps['context'];
  edit: RowProps['edit'];
  variationRows: ComponentProps<typeof FittingVariationsPanel>['rows'];
  onSwapVariation: (typeId: number) => void;
  variationsOpen: boolean;
  onToggleVariations: () => void;
  mutationOpen: boolean;
  onToggleMutation: () => void;
  canMutate: boolean;
  affectedOpen: boolean;
  onToggleAffected: () => void;
  explainModule: ComponentProps<typeof FittingAffectedByPanel>['explain'];
  typeName: (typeId: number) => string;
  characterId: ComponentProps<typeof FittingMutationPanel>['characterId'];
}

/** A fitted module's dialog: its row, then Variations, Mutation and Affected-by folds. */
export function FittingModuleDialog(props: FittingModuleDialogProps) {
  const { t } = useTranslation();
  const { module, moduleIndex, catalogue, edit } = props;
  return (
    <Modal
      open={module !== null}
      onClose={props.onClose}
      title={
        module
          ? catalogueTypeName(catalogue, module.typeId)
          : t(`fittings.list.rack.${props.fallbackSlot}`)
      }
      placement={props.placement}
    >
      {module && (
        <div className="space-y-3">
          <ModuleRow
            module={module}
            result={props.result}
            cantUse={props.cantUse}
            fitting={props.fitting}
            catalogue={catalogue}
            context={props.context}
            edit={edit}
          />
          <Disclosure
            label={t('fittings.variations.swapTitle')}
            trailing={
              props.variationRows.length > 0 ? String(props.variationRows.length) : undefined
            }
            expanded={props.variationsOpen}
            onToggle={props.onToggleVariations}
            className="rounded-xs border border-line"
          >
            <div className="p-2">
              <FittingVariationsPanel rows={props.variationRows} onSelect={props.onSwapVariation} />
            </div>
          </Disclosure>
          {props.canMutate && (
            <Disclosure
              label={t('fittings.mutation.title')}
              expanded={props.mutationOpen}
              onToggle={props.onToggleMutation}
              className="rounded-xs border border-line"
            >
              <div className="p-2">
                <FittingMutationPanel
                  module={module}
                  catalogue={catalogue}
                  edit={edit}
                  characterId={props.characterId}
                />
              </div>
            </Disclosure>
          )}
          <Disclosure
            label={t('fittings.affectedBy.title')}
            expanded={props.affectedOpen}
            onToggle={props.onToggleAffected}
            className="rounded-xs border border-line"
          >
            <div className="p-2">
              {props.affectedOpen && (
                <FittingAffectedByPanel
                  explain={props.explainModule}
                  moduleIndex={moduleIndex}
                  typeName={props.typeName}
                />
              )}
            </div>
          </Disclosure>
        </div>
      )}
    </Modal>
  );
}
