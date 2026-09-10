/**
 * Right-click menu on a Contracts row (issue #676): the title cell is a
 * button that opens `ContractDetailModal` on click, so selecting its text to
 * copy risks firing that click instead — a context menu copies without it.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
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
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void writeToClipboard(title)}>
          {t('contracts.contextMenu.copyTitle')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void writeToClipboard(String(contract.contract_id))}>
          {t('contracts.contextMenu.copyContractId')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
