import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui';
import type { DataTableColumn, DataTableSort } from '@/components/ui/DataTable';
import type { useTableExport } from '@/components/ui/useTableExport';
import { CharacterRowContextMenu } from '@/features/character/CharacterRowContextMenu';
import type { CharacterRow } from '@/features/character/charactersTableColumns';

export function CharactersTableView({
  rows,
  columns,
  extractionSummary,
  tableProps,
  sort,
  onSortChange,
  onSelect,
  onRemove,
  spExtractionEnabled,
  onToggleSpFarm,
}: {
  rows: readonly CharacterRow[];
  columns: DataTableColumn<CharacterRow>[];
  extractionSummary: string | null;
  tableProps: ReturnType<typeof useTableExport<CharacterRow>>['tableProps'];
  sort: DataTableSort | null;
  onSortChange: (next: DataTableSort) => void;
  onSelect: (characterId: number) => void;
  onRemove: (characterId: number, name: string) => void;
  spExtractionEnabled: boolean;
  onToggleSpFarm: (characterId: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      {extractionSummary && (
        <p className="mb-2 text-[0.6875rem] text-text-dim">{extractionSummary}</p>
      )}
      <DataTable
        {...tableProps}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.character.characterId}
        label={t('characters.title')}
        responsive="table"
        sort={sort}
        onSortChange={onSortChange}
        onRowClick={(row) => onSelect(row.character.characterId)}
        rowMoreActions
        rowContextMenu={(row, tr) => (
          <CharacterRowContextMenu
            characterId={row.character.characterId}
            name={row.character.name}
            spFarm={spExtractionEnabled ? row.spFarm : undefined}
            onToggleSpFarm={() => onToggleSpFarm(row.character.characterId)}
            onRemove={() => onRemove(row.character.characterId, row.character.name)}
          >
            {tr}
          </CharacterRowContextMenu>
        )}
      />
    </div>
  );
}
