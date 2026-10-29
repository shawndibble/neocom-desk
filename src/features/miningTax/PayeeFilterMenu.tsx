import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import type { PayeeRecord } from '@/db';
import type { TrackedCharacter } from '@/features/miningTax/snapshot';
import type { PayeeFilter } from './payeeFilter';

interface PayeeFilterMenuProps {
  ledgerPayees: readonly PayeeRecord[];
  characters: readonly TrackedCharacter[];
  resolvedPayeeFilter: PayeeFilter;
  onChange: (next: PayeeFilter) => void;
  onTogglePayee: (payeeId: string) => void;
}

/** The Payee filter dropdown above the Open list: all, none, or a ticked set. */
export function PayeeFilterMenu({
  ledgerPayees,
  characters,
  resolvedPayeeFilter,
  onChange,
  onTogglePayee,
}: PayeeFilterMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          {resolvedPayeeFilter === 'all'
            ? t('miningTax.allPayees')
            : resolvedPayeeFilter === 'none'
              ? t('miningTax.noPayees')
              : t('miningTax.payeesSelected', {
                  count: resolvedPayeeFilter.size,
                })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="flex">
          <DropdownMenuItem
            className="flex-1 justify-center"
            onSelect={(e) => {
              e.preventDefault();
              onChange('all');
            }}
          >
            {t('miningTax.selectAllPayees')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex-1 justify-center"
            onSelect={(e) => {
              e.preventDefault();
              onChange('none');
            }}
          >
            {t('miningTax.selectNoPayees')}
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator />
        {ledgerPayees.map((p) => (
          <DropdownMenuCheckboxItem
            key={p.id}
            checked={
              resolvedPayeeFilter === 'all' ||
              (resolvedPayeeFilter !== 'none' && resolvedPayeeFilter.has(p.id))
            }
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onTogglePayee(p.id)}
          >
            {characters.length > 1
              ? t('miningTax.payeeOptionWithCharacter', {
                  payee: p.name,
                  character:
                    characters.find((c) => c.characterId === p.characterId)?.characterName ?? '',
                })
              : p.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
