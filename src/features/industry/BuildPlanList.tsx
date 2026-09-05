import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  IconButton,
  NativeSelect,
  SearchInput,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import { BlueprintPicker } from './BlueprintPicker';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { filterAndSortPlans, type SortMode } from './buildPlanSort';

interface BuildPlanListProps {
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (entry: BlueprintCatalogEntry) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** Compare mode (issue #453): a per-row checkbox replaces plain row selection for building a comparison set. */
  compareMode: boolean;
  compareSelectedIds: ReadonlySet<string>;
  onToggleCompareMode: () => void;
  onToggleCompareSelected: (id: string) => void;
  /** Opens the comparison table for the checked plans (disabled below 2 selections). */
  onOpenCompare: () => void;
}

function PlanRow({
  plan,
  active,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
  compareMode,
  compareSelected,
  onToggleCompareSelected,
}: {
  plan: BuildPlanRecord;
  active: boolean;
  compareMode: boolean;
  compareSelected: boolean;
  onToggleCompareSelected: (id: string) => void;
} & Pick<BuildPlanListProps, 'onSelect' | 'onDuplicate' | 'onDelete' | 'onRename'>) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(plan.name);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== plan.name) onRename(plan.id, name);
    else setDraftName(plan.name);
  }

  return (
    <li
      className={`flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
        active ? 'bg-panel-2' : ''
      }`}
    >
      {compareMode && (
        <input
          type="checkbox"
          checked={compareSelected}
          onChange={() => onToggleCompareSelected(plan.id)}
          aria-label={t('industry.compareSelectFor', { name: plan.name })}
          className="size-4 shrink-0 cursor-pointer accent-accent"
        />
      )}
      {renaming ? (
        <TextInput
          size="sm"
          autoFocus
          value={draftName}
          aria-label={t('industry.rename')}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraftName(plan.name);
              setRenaming(false);
            }
          }}
          className="flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(plan.id)}
          onDoubleClick={() => setRenaming(true)}
          className="flex-1 truncate text-left"
        >
          {plan.name}
        </button>
      )}
      {/* Three labelled buttons left the plan name ~90px on a phone ("Raven
          Nav…"). The name is the row — the actions are the adornment — so the
          actions become icons and give the width back. Each label names the
          plan too, so a screen reader hears which row it is on; the tooltip
          drops it, since a pointer user is already looking at the row. */}
      <IconButton
        size="sm"
        icon={<Icon.Rename />}
        label={`${t('industry.rename')} ${plan.name}`}
        tooltip={t('industry.rename')}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Duplicate />}
        label={`${t('industry.duplicate')} ${plan.name}`}
        tooltip={t('industry.duplicate')}
        onClick={() => onDuplicate(plan.id)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={`${t('industry.delete')} ${plan.name}`}
        tooltip={t('industry.delete')}
        tone="danger"
        onClick={() => onDelete(plan.id)}
      />
    </li>
  );
}

/** Build Plan CRUD list: create via blueprint search, select, duplicate, delete, rename inline. Also owns Compare mode's row checkboxes (issue #453) — the comparison itself renders in `Industry.tsx`'s detail pane. */
export function BuildPlanList({
  plans,
  catalog,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onRename,
  compareMode,
  compareSelectedIds,
  onToggleCompareMode,
  onToggleCompareSelected,
  onOpenCompare,
}: BuildPlanListProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('alphabetical');

  const visiblePlans = useMemo(() => filterAndSortPlans(plans, query, sort), [plans, query, sort]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.title')}
        </h2>
        <div className="flex items-center gap-2">
          {compareMode ? (
            <>
              <Button size="sm" onClick={onToggleCompareMode}>
                {t('industry.compareCancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={compareSelectedIds.size < 2}
                onClick={onOpenCompare}
              >
                {t('industry.compareHandle', { count: compareSelectedIds.size })}
              </Button>
            </>
          ) : (
            plans.length > 1 && (
              <Button size="sm" onClick={onToggleCompareMode}>
                {t('industry.compareToggle')}
              </Button>
            )
          )}
          <Button variant="primary" size="sm" onClick={() => setCreating((c) => !c)}>
            {t('industry.create')}
          </Button>
        </div>
      </div>

      {creating && (
        <BlueprintPicker
          catalog={catalog}
          onPick={(entry) => {
            onCreate(entry);
            setCreating(false);
          }}
        />
      )}

      {plans.length === 0 ? (
        <EmptyState
          title={t('industry.emptyTitle')}
          hint={t('industry.emptyHint')}
          className="py-6"
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('industry.searchPlans')}
              aria-label={t('industry.searchPlans')}
              className="flex-1"
            />
            <NativeSelect
              size="md"
              aria-label={t('industry.sortLabel')}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
            >
              <option value="alphabetical">{t('industry.sortAlphabetical')}</option>
              <option value="lastUpdated">{t('industry.sortLastUpdated')}</option>
            </NativeSelect>
          </div>
          {visiblePlans.length === 0 ? (
            <EmptyState title={t('industry.searchNoResults')} className="py-4" />
          ) : (
            // The scroller is the row list alone, not the whole pane: the heading,
            // the create button and the blueprint picker stay put while a long
            // plan list scrolls under them, same as Mail's list.
            <ul className="max-h-[28rem] overflow-y-auto rounded-xs border border-line">
              {visiblePlans.map((plan) => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  active={plan.id === selectedId}
                  onSelect={onSelect}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  onRename={onRename}
                  compareMode={compareMode}
                  compareSelected={compareSelectedIds.has(plan.id)}
                  onToggleCompareSelected={onToggleCompareSelected}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
