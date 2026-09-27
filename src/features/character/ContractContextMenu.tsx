/**
 * Right-click menu on a Contracts row (issue #676): the title cell is a
 * button that opens `ContractDetailModal` on click, so selecting its text to
 * copy risks firing that click instead — a context menu copies without it.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import type { Contract } from '@/esi/endpoints';

export interface ContractContextMenuProps {
  contract: Contract;
  children: ReactElement;
}

export function ContractContextMenu({ contract, children }: ContractContextMenuProps) {
  const { t } = useTranslation();
  const title = contract.title || t(CONTRACT_TYPE_KEY[contract.type]);

  return (
    <RowActionsMenu
      name={title}
      items={
        <>
          <MenuItem onSelect={() => void writeToClipboard(title)}>
            {t('contracts.contextMenu.copyTitle')}
          </MenuItem>
          <MenuItem onSelect={() => void writeToClipboard(String(contract.contract_id))}>
            {t('contracts.contextMenu.copyContractId')}
          </MenuItem>
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
