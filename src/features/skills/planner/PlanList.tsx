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
import { useTimeZone } from '@/lib/timeFormat';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';

export interface PlanRowStats {
  totalSeconds: number;
  finish: Date | null;
}

interface PlanListProps {
  plans: readonly SkillPlanRecord[];
  planHref: (id: string) => string;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void;
  otherCharacters?: readonly Pick<CharacterRecord, 'characterId' | 'name'>[];
  onCopyToCharacter?: (id: string, characterId: number) => void;
  stats?: ReadonlyMap<string, PlanRowStats>;
  activePlanId?: string;
  autoRenamePlanId?: string | null;
  onAutoRenameStarted?: () => void;
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
  const timeZone = useTimeZone();
  const [renaming, setRenaming] = useState(autoRename);
  const [draftName, setDraftName] = useState(plan.name);
  const rowMenu = useOpenAfterMenu();
  const focusAfterCommit = useFocusAfterCommit();
  const moreRef = useRef<HTMLButtonElement>(null);
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
                        date: formatLocalDate(stats.finish, timeZone),
                      })}
                </span>
              )}
            </span>
          </Link>
        </Tooltip>
      )}
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

  async function deletePlan(target: SkillPlanRecord) {
    const index = plans.findIndex((plan) => plan.id === target.id);
    const near = [plans[index + 1], plans[index - 1]].map(
      (plan) => () => (plan ? linkRefs.current.get(plan.id) : null)
    );
    await onDelete(target.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    focusAfterCommit(...near, headingRef);
  }
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
              onRequestDelete={(plan) => void deletePlan(plan)}
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
    </div>
  );
}
