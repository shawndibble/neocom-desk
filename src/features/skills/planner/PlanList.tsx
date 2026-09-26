import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Modal,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterRecord, SkillPlanRecord } from '@/db';
import { formatDuration } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';

/** A plan's costed total and finish (`null` when there is nothing left to train). */
export interface PlanRowStats {
  totalSeconds: number;
  finish: Date | null;
}

interface PlanListProps {
  plans: readonly SkillPlanRecord[];
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** The account's other characters; "Copy to character" shows only when there are any. */
  otherCharacters?: readonly Pick<CharacterRecord, 'characterId' | 'name'>[];
  onCopyToCharacter?: (id: string, characterId: number) => void;
  /** Per-plan schedule figures by plan id; rows without an entry show name only. */
  stats?: ReadonlyMap<string, PlanRowStats>;
  /** The plan open in the editor, marked in the list; omitted on the plain list route. */
  activePlanId?: string;
  /** A just-created plan whose row opens straight into rename; reported back via `onAutoRenameStarted`. */
  autoRenamePlanId?: string | null;
  onAutoRenameStarted?: () => void;
}

function PlanRow({
  plan,
  onOpen,
  onDuplicate,
  onRequestCopy,
  onRequestDelete,
  onRename,
  stats,
  active,
  autoRename,
  onAutoRenameStarted,
}: {
  plan: SkillPlanRecord;
  active: boolean;
  autoRename: boolean;
  onAutoRenameStarted?: () => void;
  stats: PlanRowStats | undefined;
  onRequestCopy: ((plan: SkillPlanRecord) => void) | null;
  onRequestDelete: (plan: SkillPlanRecord) => void;
} & Pick<PlanListProps, 'onOpen' | 'onDuplicate' | 'onRename'>) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(autoRename);
  const [draftName, setDraftName] = useState(plan.name);
  const renameChosen = useRef(false);
  // The new plan's row can mount before or after the flag arrives, so both
  // orders must land in rename mode — adjusting state during render, not in an effect.
  const [seenAutoRename, setSeenAutoRename] = useState(autoRename);
  if (autoRename !== seenAutoRename) {
    setSeenAutoRename(autoRename);
    if (autoRename) setRenaming(true);
  }
  useEffect(() => {
    if (autoRename) onAutoRenameStarted?.();
  }, [autoRename, onAutoRenameStarted]);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== plan.name) onRename(plan.id, name);
    else setDraftName(plan.name);
  }

  return (
    <li
      className={`flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${active ? 'bg-accent/15' : ''}`}
    >
      {renaming ? (
        <TextInput
          size="sm"
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
          className="flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => onOpen(plan.id)}
          aria-current={active ? 'true' : undefined}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate">{plan.name}</span>
          {stats && (
            <span className="block truncate text-[0.6875rem] text-text-dim tabular-nums">
              {stats.finish === null
                ? t('plans.listRowNothingToTrain')
                : t('plans.listRowStats', {
                    duration: formatDuration(stats.totalSeconds),
                    date: formatLocalDate(stats.finish),
                  })}
            </span>
          )}
        </button>
      )}
      {/* Rename, Duplicate and Copy live in one menu so the name keeps the row's
          width (and the finish date under it stays on one line). Delete stays a
          visible button: it is the destructive one. */}
      {
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              size="sm"
              variant="plain"
              icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
              label={t('plans.moreActions', { name: plan.name })}
            />
          </DropdownMenuTrigger>
          {/* Rename opens its input only once the menu has closed: opened earlier,
              the menu's focus handling blurs it and cancels the rename. */}
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(e) => {
              if (renameChosen.current) {
                e.preventDefault();
                renameChosen.current = false;
                setRenaming(true);
              }
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                renameChosen.current = true;
              }}
            >
              {t('plans.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate(plan.id)}>
              {t('plans.duplicate')}
            </DropdownMenuItem>
            {onRequestCopy && (
              <DropdownMenuItem onSelect={() => onRequestCopy(plan)}>
                {t('plans.copyToCharacter')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={`${t('plans.delete')} ${plan.name}`}
        tone="danger"
        onClick={() => onRequestDelete(plan)}
      />
    </li>
  );
}

/** Skill Plan CRUD list: create, open (navigates to the editor), duplicate, delete (confirm), rename inline. */
export function PlanList({
  plans,
  onOpen,
  onDuplicate,
  onDelete,
  onRename,
  otherCharacters = [],
  onCopyToCharacter,
  stats,
  activePlanId,
  autoRenamePlanId = null,
  onAutoRenameStarted,
}: PlanListProps) {
  const { t } = useTranslation();
  const [deletingPlan, setDeletingPlan] = useState<SkillPlanRecord | null>(null);
  const [copyingPlan, setCopyingPlan] = useState<SkillPlanRecord | null>(null);
  const canCopy = otherCharacters.length > 0 && onCopyToCharacter !== undefined;

  return (
    <div className="space-y-2">
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
              onRequestCopy={canCopy ? setCopyingPlan : null}
              onRequestDelete={setDeletingPlan}
              onRename={onRename}
              stats={stats?.get(plan.id)}
              active={plan.id === activePlanId}
              autoRename={plan.id === autoRenamePlanId}
              onAutoRenameStarted={onAutoRenameStarted}
            />
          ))}
        </ul>
      )}
      <Modal
        open={copyingPlan !== null}
        onClose={() => setCopyingPlan(null)}
        title={t('plans.copyToCharacter')}
      >
        <p className="text-xs text-text-dim">
          {t('plans.copyToCharacterHint', { name: copyingPlan?.name ?? '' })}
        </p>
        <ul className="mt-3 space-y-1">
          {otherCharacters.map((character) => (
            <li key={character.characterId}>
              <Button
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  if (copyingPlan) onCopyToCharacter?.(copyingPlan.id, character.characterId);
                  setCopyingPlan(null);
                }}
              >
                {character.name}
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => setCopyingPlan(null)}>
            {t('plans.cancel')}
          </Button>
        </div>
      </Modal>
      <Modal
        open={deletingPlan !== null}
        onClose={() => setDeletingPlan(null)}
        title={t('plans.delete')}
      >
        <p className="text-xs text-text-dim">
          {t('plans.deleteConfirm', { name: deletingPlan?.name ?? '' })}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingPlan(null)}>
            {t('plans.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (deletingPlan) onDelete(deletingPlan.id);
              setDeletingPlan(null);
            }}
          >
            {t('plans.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
