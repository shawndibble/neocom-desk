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
  /** Whether a Character exists to open the Payee manager for. */
  canManagePayees: boolean;
  /** Whether the header row has room for Payees outside the ⋮. */
  payeesInline: boolean;
  onManagePayees: () => void;
  onRefresh: () => void;
  loading: boolean;
  onOpenOreTags: () => void;
  onOpenSettings: () => void;
}

/**
 * The tab's controls ride the page title's own line rather than a strip
 * of their own below the tab bar: they act on this tab's whole snapshot,
 * which is what `PageHeader.actions` is for. Rendering the header here
 * rather than in the route shell is what lets the `DataAgeBadge` read
 * `fetchedAt` directly — see the note on `MoonMiningTax`.
 */
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
      // None while the tab waits on its first Payee: the body is then only
      // that call to action, with no list for the picker to filter, and the
      // accent Payees button keeps the phone row's room for the title.
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
            disabled={loading}
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
