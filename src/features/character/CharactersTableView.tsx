import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui';
import type { DataTableColumn, DataTableSort } from '@/components/ui/DataTable';
import type { useTableExport } from '@/components/ui/useTableExport';
import { CharacterRowContextMenu } from '@/features/character/CharacterRowContextMenu';
import type { CharacterRow } from '@/features/character/charactersTableColumns';

/**
 * Table view — one flat `DataTable` over the whole (filtered) roster, not
 * one per group section (decision 20260927-071415): the `group` column
 * carries membership per row instead, and `GroupSectionHeader`'s
 * rename/reorder/delete stay card view only.
 */
export function CharactersTableView({
  rows,
  columns,
  extractionSummary,
  tableProps,
  sort,
  onSortChange,
  onSelect,
  onRemove,
}: {
  rows: readonly CharacterRow[];
  columns: DataTableColumn<CharacterRow>[];
  extractionSummary: string | null;
  /** Export wiring from `useTableExport`. */
  tableProps: ReturnType<typeof useTableExport<CharacterRow>>['tableProps'];
  sort: DataTableSort | null;
  onSortChange: (next: DataTableSort) => void;
  onSelect: (characterId: number) => void;
  onRemove: (characterId: number, name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    // Deliberate deviation from DataTable's usual `.dt-stack` collapse on
    // mobile (docs/context/decisions/20260909-130638-characters-table-
    // view-mobile-scroll-roster-overview-split.md): a real, comparable
    // table stays a table, and scrolls sideways instead, at every width.
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
            onRemove={() => onRemove(row.character.characterId, row.character.name)}
          >
            {tr}
          </CharacterRowContextMenu>
        )}
      />
    </div>
  );
}
