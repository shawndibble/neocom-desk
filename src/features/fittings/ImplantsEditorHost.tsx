/**
 * The Implants & Boosters editor, mounted by the Fittings page and open while
 * the URL says `?implants=1`. It lives here and not under the chip that opens
 * it (`ImplantSetControl`, in the Pilot panel, which
 * a phone mounts only on its Stats tab), so Back from the market lands on an
 * editor that is already open however the page's panels were left.
 */
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { ImplantSetPicker } from './ImplantSetPicker';
import { useImplantsModalUrl } from './useImplantsModalUrl';

interface ImplantsEditorHostProps {
  /** What the stats are on, as the workspace resolved it. */
  basis: ImplantBasis;
  /** A Character is active, so there is a clone to go back to. */
  canUseCloneBasis: boolean;
  implantSet: FittingImplantSet | undefined;
  onImplantSetChange: (implantSet: FittingImplantSet | undefined) => void;
  /** The open Fitting and pilot, for "Find by goal"; absent until the pilot loads. */
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
