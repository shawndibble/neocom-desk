import { focusRingInsetClassName, selectedRowClassName } from '@/components/ui/controlStyles';
import { Link } from 'react-router-dom';
import { cx } from '@/lib/cx';
import { useEffect, useRef, useState, type RefObject } from 'react';
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
  Tooltip,
  useOpenAfterMenu,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterRecord, SkillPlanRecord } from '@/db';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';

/** A plan's costed total and finish (`null` when there is nothing left to train). */
export interface PlanRowStats {
  totalSeconds: number;
  finish: Date | null;
}

interface PlanListProps {
  plans: readonly SkillPlanRecord[];
  /** Where a plan's row goes: the row is a real link (DESIGN.md §6c). */
  planHref: (id: string) => string;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
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
  /** The Plans panel's title (its `headingRef`): where focus lands when the last plan is deleted. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

function PlanRow({
  plan,
  planHref,
  onDuplicate,
  onRequestCopy,
  onRequestDelete,
  onRename,
  stats,
  active,
  autoRename,
  onAutoRenameStarted,
  registerLink,
}: {
  plan: SkillPlanRecord;
  registerLink: (id: string, el: HTMLAnchorElement | null) => void;
  active: boolean;
  autoRename: boolean;
  onAutoRenameStarted?: () => void;
  stats: PlanRowStats | undefined;
  onRequestCopy: ((plan: SkillPlanRecord) => void) | null;
  onRequestDelete: (plan: SkillPlanRecord) => void;
} & Pick<PlanListProps, 'planHref' | 'onDuplicate' | 'onRename'>) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(autoRename);
  const [draftName, setDraftName] = useState(plan.name);
  const rowMenu = useOpenAfterMenu();
  const focusAfterCommit = useFocusAfterCommit();
  const moreRef = useRef<HTMLButtonElement>(null);
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

  // Enter and Escape unmount the focused input; hand focus to the row's ⋮.
  // Blur does not: the pilot is already moving on.
  function endRename(commit: boolean) {
    if (commit) commitRename();
    else {
      setDraftName(plan.name);
      setRenaming(false);
    }
    focusAfterCommit(moreRef);
  }

  return (
    <li
      className={`flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${active ? selectedRowClassName : ''}`}
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
            if (e.key === 'Enter') {
              // Focus moves to a button mid-keystroke: its keypress must not click it.
              e.preventDefault();
              endRename(true);
            }
            if (e.key === 'Escape') endRename(false);
          }}
          className="flex-1"
        />
      ) : (
        <Tooltip content={plan.name} className="min-w-0 flex-1">
          <Link
            ref={(el) => registerLink(plan.id, el)}
            to={planHref(plan.id)}
            aria-current={active ? 'true' : undefined}
            className={cx(
              'group flex min-w-0 flex-1 items-center gap-1 rounded-xs text-left',
              focusRingInsetClassName
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="dt-primary block truncate text-accent group-hover:underline">
                {plan.name}
              </span>
              {stats && (
                <span className="block truncate text-[0.6875rem] text-text-dim tabular-nums">
                  {stats.finish === null
                    ? t('plans.listRowNothingToTrain')
                    : t('plans.listRowStats', {
                        duration: formatCountdown(stats.totalSeconds),
                        date: formatLocalDate(stats.finish),
                      })}
                </span>
              )}
            </span>
          </Link>
        </Tooltip>
      )}
      {/* One trailing ⋮ holds every action (Delete is the danger item), so the
          name keeps the row's width and the finish date under it stays on one line. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            ref={moreRef}
            size="sm"
            variant="plain"
            icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
            label={t('plans.moreActions', { name: plan.name })}
          />
        </DropdownMenuTrigger>
        {/* Rename, Copy and Delete open only once the menu has closed: opened
              earlier, the menu's focus handling blurs the rename input and the
              dialogs record an item that is about to unmount as their restore target. */}
        <DropdownMenuContent align="end" onCloseAutoFocus={rowMenu.onCloseAutoFocus}>
          <DropdownMenuItem
            onSelect={() => rowMenu.run(() => setRenaming(true), { keepFocus: true })}
          >
            {t('plans.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(plan.id)}>
            {t('plans.duplicate')}
          </DropdownMenuItem>
          {onRequestCopy && (
            <DropdownMenuItem onSelect={() => rowMenu.run(() => onRequestCopy(plan))}>
              {t('plans.copyToCharacter')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-danger"
            onSelect={() => rowMenu.run(() => onRequestDelete(plan))}
          >
            {t('plans.deleteMenu')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Skill Plan CRUD list: create, open (navigates to the editor), duplicate, delete (confirm), rename inline. */
export function PlanList({
  plans,
  planHref,
  onDuplicate,
  onDelete,
  onRename,
  otherCharacters = [],
  onCopyToCharacter,
  stats,
  activePlanId,
  autoRenamePlanId = null,
  onAutoRenameStarted,
  headingRef,
}: PlanListProps) {
  const { t } = useTranslation();
  const focusAfterCommit = useFocusAfterCommit();
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  function registerLink(id: string, el: HTMLAnchorElement | null) {
    if (el) linkRefs.current.set(id, el);
    else linkRefs.current.delete(id);
  }

  // The row goes only after the dialog has closed (an awaited delete), so
  // focus is requested once the delete resolves: the next plan's link, else
  // the previous one's, else the panel title.
  async function confirmDelete() {
    const target = deletingPlan;
    setDeletingPlan(null);
    if (!target) return;
    const index = plans.findIndex((plan) => plan.id === target.id);
    const near = [plans[index + 1], plans[index - 1]].map(
      (plan) => () => (plan ? linkRefs.current.get(plan.id) : null)
    );
    await onDelete(target.id);
    // One macrotask on: the dialog's own focus restore (to the row being
    // deleted) runs in a passive effect and must not land after this request.
    await new Promise((resolve) => setTimeout(resolve, 0));
    focusAfterCommit(...near, headingRef);
  }
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
              planHref={planHref}
              onDuplicate={onDuplicate}
              onRequestCopy={canCopy ? setCopyingPlan : null}
              onRequestDelete={setDeletingPlan}
              onRename={onRename}
              stats={stats?.get(plan.id)}
              active={plan.id === activePlanId}
              autoRename={plan.id === autoRenamePlanId}
              onAutoRenameStarted={onAutoRenameStarted}
              registerLink={registerLink}
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
          <Button variant="danger" size="sm" onClick={() => void confirmDelete()}>
            {t('plans.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
