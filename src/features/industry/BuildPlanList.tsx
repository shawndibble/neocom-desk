import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '@/components/ui';
import type { BuildPlanRecord } from '@/db';
import { BlueprintPicker } from './BlueprintPicker';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';

interface BuildPlanListProps {
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (entry: BlueprintCatalogEntry) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function PlanRow({
  plan,
  active,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
}: {
  plan: BuildPlanRecord;
  active: boolean;
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
      {renaming ? (
        <input
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
          className="h-6 flex-1 rounded-xs border border-line bg-panel-2 px-1 text-text"
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
      <Button
        size="sm"
        onClick={() => setRenaming(true)}
        aria-label={`${t('industry.rename')} ${plan.name}`}
      >
        {t('industry.rename')}
      </Button>
      <Button size="sm" onClick={() => onDuplicate(plan.id)}>
        {t('industry.duplicate')}
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          if (window.confirm(t('industry.deleteConfirm'))) onDelete(plan.id);
        }}
      >
        {t('industry.delete')}
      </Button>
    </li>
  );
}

/** Build Plan CRUD list: create via blueprint search, select, duplicate, delete (confirm), rename inline. */
export function BuildPlanList({
  plans,
  catalog,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onRename,
}: BuildPlanListProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.title')}
        </h2>
        <Button variant="primary" size="sm" onClick={() => setCreating((c) => !c)}>
          {t('industry.create')}
        </Button>
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
        <ul className="rounded-xs border border-line">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              active={plan.id === selectedId}
              onSelect={onSelect}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
