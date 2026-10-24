/**
 * Right-click / hold / ⋮ menu for a Pending or Owed claim row. Approve, Reject, Mark paid and
 * Copy amount are visible buttons on the row, so they are not repeated here (DESIGN.md §6c).
 * What only the claim detail carried is: Change amount and the pilot's entity actions.
 * History rows have no menu: their only extras are the pilot's, one real action.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { useOpenAfterMenu } from '@/components/ui/useOpenAfterMenu';
import { CharacterMenuItems } from '../corpRowMenus';
import type { SrpClaim } from '../srpClaimTypes';

export function OfficerRowMenu({
  claim,
  onChangeAmount,
  children,
}: {
  claim: SrpClaim;
  onChangeAmount: (claim: SrpClaim) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  return (
    <RowActionsMenu
      name={claim.characterName}
      linksKeepBrowserMenu
      onCloseAutoFocus={onCloseAutoFocus}
      items={
        <>
          <MenuItem onSelect={() => run(() => onChangeAmount(claim))}>
            {t('srp.officer.actions.changeAmount')}
          </MenuItem>
          <CharacterMenuItems characterId={claim.characterId} name={claim.characterName} />
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
