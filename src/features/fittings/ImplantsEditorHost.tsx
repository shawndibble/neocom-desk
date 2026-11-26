import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { ImplantSetPicker } from './ImplantSetPicker';
import { useImplantsModalUrl } from './useImplantsModalUrl';

interface ImplantsEditorHostProps {
  basis: ImplantBasis;
  canUseCloneBasis: boolean;
  implantSet: FittingImplantSet | undefined;
  onImplantSetChange: (implantSet: FittingImplantSet | undefined) => void;
  fitting?: Fitting;
  profile?: PilotProfile | null;
}

export function ImplantsEditorHost({
  basis,
  canUseCloneBasis,
  implantSet,
  onImplantSetChange,
  fitting,
  profile,
}: ImplantsEditorHostProps) {
  const { open, closeModal } = useImplantsModalUrl('implants');
  return (
    <ImplantSetPicker
      open={open}
      onClose={closeModal}
      implantSet={implantSet}
      onChange={onImplantSetChange}
      {...(canUseCloneBasis ? { onUseClone: () => onImplantSetChange(undefined) } : {})}
      {...(fitting && profile ? { finder: { fitting, profile, basis } } : {})}
    />
  );
}
