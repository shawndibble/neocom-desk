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
