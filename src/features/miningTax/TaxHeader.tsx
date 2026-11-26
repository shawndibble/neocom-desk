import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DropdownMenuItem,
  HeaderMoreMenu,
  IconButton,
  PageHeader,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';

interface TaxHeaderProps {
  fetchedAt: Date | null | undefined;
  needsFirstPayee: boolean;
  activeCharacterId: number | null;
  characterFilter: CharacterFilterValue;
  onCharacterFilterChange: (next: CharacterFilterValue) => void;
  characterIds: number[];
  canManagePayees: boolean;
  payeesInline: boolean;
  onManagePayees: () => void;
  onRefresh: () => void;
  loading: boolean;
  onOpenOreTags: () => void;
  onOpenSettings: () => void;
}

export function TaxHeader({
  fetchedAt,
  needsFirstPayee,
  activeCharacterId,
  characterFilter,
  onCharacterFilterChange,
  characterIds,
  canManagePayees,
  payeesInline,
  onManagePayees,
  onRefresh,
  loading,
  onOpenOreTags,
  onOpenSettings,
}: TaxHeaderProps) {
  const { t } = useTranslation();
  return (
    <PageHeader
      title={t('miningTax.title')}
      meta={fetchedAt ? <DataAgeBadge date={fetchedAt} /> : undefined}
      scope={
        !needsFirstPayee && (
          <CharacterFilterControl
            activeCharacterId={activeCharacterId}
            value={characterFilter}
            onChange={onCharacterFilterChange}
            characterCount={characterIds.length}
            allCharacterIds={characterIds}
          />
        )
      }
      actions={
        <>
          {payeesInline && (
            <Button variant={needsFirstPayee ? 'accent' : 'ghost'} onClick={onManagePayees}>
              {t('miningTax.managePayeesAction')}
            </Button>
          )}
          <IconButton
            icon={<Icon.Refresh />}
            label={t('miningTax.refresh')}
            onClick={onRefresh}
            busy={loading}
          />
          <HeaderMoreMenu>
            {canManagePayees && !payeesInline && (
              <DropdownMenuItem onSelect={onManagePayees}>
                {t('miningTax.managePayeesAction')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onOpenOreTags}>
              {t('miningTax.oreTagsAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenSettings}>
              {t('pageSettings.menuItem')}
            </DropdownMenuItem>
          </HeaderMoreMenu>
        </>
      }
    />
  );
}
