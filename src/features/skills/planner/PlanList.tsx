import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '@/components/ui';
import type { SkillPlanRecord } from '@/db';

interface PlanListProps {
  plans: readonly SkillPlanRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
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
  plan: SkillPlanRecord;
  active: boolean;
} & Pick<PlanListProps, 'onSelect' | 'onDuplicate' | 'onDelete' | 'onRename'>) {
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
          aria-label={t('plans.rename')}
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
        aria-label={`${t('plans.rename')} ${plan.name}`}
      >
        {t('plans.rename')}
      </Button>
      <Button size="sm" onClick={() => onDuplicate(plan.id)}>
        {t('plans.duplicate')}
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          if (window.confirm(t('plans.deleteConfirm'))) onDelete(plan.id);
        }}
      >
        {t('plans.delete')}
      </Button>
    </li>
  );
}

/** Skill Plan CRUD list: create, select, duplicate, delete (confirm), rename inline. */
export function PlanList({
  plans,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onRename,
}: PlanListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
          {t('plans.title')}
        </h2>
        <Button variant="primary" size="sm" onClick={onCreate}>
          {t('plans.create')}
        </Button>
      </div>
      {plans.length === 0 ? (
        <EmptyState title={t('plans.emptyTitle')} hint={t('plans.emptyHint')} className="py-6" />
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
