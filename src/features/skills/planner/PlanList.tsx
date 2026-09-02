import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal } from '@/components/ui';
import type { SkillPlanRecord } from '@/db';

interface PlanListProps {
  plans: readonly SkillPlanRecord[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

const ICON_BUTTON = 'w-7 justify-center';

function PlanRow({
  plan,
  onOpen,
  onDuplicate,
  onRequestDelete,
  onRename,
}: {
  plan: SkillPlanRecord;
  onRequestDelete: (id: string) => void;
} & Pick<PlanListProps, 'onOpen' | 'onDuplicate' | 'onRename'>) {
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
    <li className="flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0">
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
        <button type="button" onClick={() => onOpen(plan.id)} className="flex-1 truncate text-left">
          {plan.name}
        </button>
      )}
      <Button
        size="sm"
        className={ICON_BUTTON}
        onClick={() => setRenaming(true)}
        aria-label={`${t('plans.rename')} ${plan.name}`}
      >
        <span aria-hidden="true">✎</span>
      </Button>
      <Button
        size="sm"
        className={ICON_BUTTON}
        onClick={() => onDuplicate(plan.id)}
        aria-label={`${t('plans.duplicate')} ${plan.name}`}
      >
        <span aria-hidden="true">⧉</span>
      </Button>
      <Button
        variant="danger"
        size="sm"
        className={ICON_BUTTON}
        onClick={() => onRequestDelete(plan.id)}
        aria-label={`${t('plans.delete')} ${plan.name}`}
      >
        <span aria-hidden="true">✕</span>
      </Button>
    </li>
  );
}

/** Skill Plan CRUD list: create, open (navigates to the editor), duplicate, delete (confirm), rename inline. */
export function PlanList({
  plans,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
  onRename,
}: PlanListProps) {
  const { t } = useTranslation();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
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
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onRequestDelete={setDeletingId}
              onRename={onRename}
            />
          ))}
        </ul>
      )}
      <Modal
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
        title={t('plans.delete')}
      >
        <p className="text-xs text-text-dim">{t('plans.deleteConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingId(null)}>
            {t('plans.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (deletingId) onDelete(deletingId);
              setDeletingId(null);
            }}
          >
            {t('plans.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
