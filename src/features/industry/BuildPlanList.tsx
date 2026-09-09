import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import { BlueprintPicker } from './BlueprintPicker';
import type { BuildGroup } from './buildGroups';
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
  /** Compare mode (issue #453): a per-row checkbox replaces plain row selection for building a comparison set. */
  compareMode: boolean;
  compareSelectedIds: ReadonlySet<string>;
  onToggleCompareMode: () => void;
  onToggleCompareSelected: (id: string) => void;
  /** Opens the comparison table for the checked plans (disabled below 2 selections). */
  onOpenCompare: () => void;
  /** Build Groups (issue #626), in display order. */
  groups: readonly BuildGroup[];
  /** Which groups are open. Absent means collapsed — see `expandedGroups.ts`. */
  expandedGroupIds: ReadonlySet<string>;
  selectedGroupId: string | null;
  onToggleGroup: (groupId: string) => void;
  /** Opens the group's own rollup in the detail pane. */
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  /** Moves one plan into a group, or out of every group when null. */
  onMovePlan: (planId: string, groupId: string | null) => void;
  onOpenFitImport: () => void;
}

type PlanRowProps = {
  plan: BuildPlanRecord;
  active: boolean;
  compareMode: boolean;
  compareSelected: boolean;
  onToggleCompareSelected: (id: string) => void;
  groups: readonly BuildGroup[];
  onMovePlan: (planId: string, groupId: string | null) => void;
  /** Set on a row sitting under its group's header, to step it in from the ungrouped ones. */
  indented?: boolean;
} & Pick<BuildPlanListProps, 'onSelect' | 'onDuplicate' | 'onDelete' | 'onRename'>;

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
  groups,
  onMovePlan,
  indented = false,
}: PlanRowProps) {
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
      className={`flex items-center gap-2 border-b border-line py-1.5 pr-2 text-xs last:border-b-0 ${
        indented ? 'pl-6' : 'pl-2'
      } ${active ? 'bg-panel-2' : ''}`}
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
          drops it, since a pointer user is already looking at the row.

          Grouping is a fourth control, which would take that width straight
          back, so it lives behind a menu rather than beside them (#626). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="sm"
            icon={<Icon.BuildGroup />}
            label={`${t('industry.moveToGroup')} ${plan.name}`}
            tooltip={t('industry.moveToGroup')}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {groups.map((group) => (
            <DropdownMenuItem
              key={group.id}
              disabled={plan.buildGroupId === group.id}
              onSelect={() => onMovePlan(plan.id, group.id)}
            >
              {group.name}
            </DropdownMenuItem>
          ))}
          {groups.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            disabled={plan.buildGroupId === undefined}
            onSelect={() => onMovePlan(plan.id, null)}
          >
            {t('industry.removeFromGroup')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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

function GroupHeader({
  group,
  memberCount,
  expanded,
  active,
  compareMode,
  membersSelected,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onToggleAllMembers,
}: {
  group: BuildGroup;
  memberCount: number;
  expanded: boolean;
  active: boolean;
  compareMode: boolean;
  /** 'all' | 'some' | 'none' — drives the header checkbox's indeterminate state. */
  membersSelected: 'all' | 'some' | 'none';
  onToggle: () => void;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onToggleAllMembers: (selected: boolean) => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== group.name) onRename(name);
    else setDraftName(group.name);
  }

  return (
    <li
      className={`flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs ${
        active ? 'bg-panel-2' : ''
      }`}
    >
      {/* Compare's checkbox only ever renders on a *visible* row, so a
          collapsed group's members are unreachable without this — it selects
          every member at once rather than making the pilot expand first. */}
      {compareMode && (
        <input
          type="checkbox"
          checked={membersSelected === 'all'}
          ref={(el) => {
            if (el) el.indeterminate = membersSelected === 'some';
          }}
          onChange={() => onToggleAllMembers(membersSelected !== 'all')}
          aria-label={t('industry.selectGroupMembers', { name: group.name })}
          className="size-4 shrink-0 cursor-pointer accent-accent"
        />
      )}
      <IconButton
        size="sm"
        variant="plain"
        icon={<Caret expanded={expanded} />}
        label={t('industry.toggleGroup', { name: group.name })}
        aria-expanded={expanded}
        onClick={onToggle}
      />
      {renaming ? (
        <TextInput
          size="sm"
          autoFocus
          value={draftName}
          aria-label={t('industry.renameGroup')}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraftName(group.name);
              setRenaming(false);
            }
          }}
          className="flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => setRenaming(true)}
          className="flex-1 truncate text-left font-semibold"
        >
          {group.name}
        </button>
      )}
      <span className="shrink-0 tabular-nums text-text-dim">{memberCount}</span>
      <IconButton
        size="sm"
        icon={<Icon.Rename />}
        label={`${t('industry.renameGroup')} ${group.name}`}
        tooltip={t('industry.renameGroup')}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={`${t('industry.deleteGroup')} ${group.name}`}
        tooltip={t('industry.deleteGroup')}
        tone="danger"
        onClick={onDelete}
      />
    </li>
  );
}

/** Build Plan CRUD list: create via blueprint search, select, duplicate, delete, rename inline. Owns Compare mode's row checkboxes (issue #453) and the Build Group rows (issue #626) — the comparison and the group rollup both render in `Industry.tsx`'s detail pane. */
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
  groups,
  expandedGroupIds,
  selectedGroupId,
  onToggleGroup,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMovePlan,
  onOpenFitImport,
}: BuildPlanListProps) {
  const { t } = useTranslation();

  // A plan whose group is gone — deleted here, or a sync race delivering the
  // plan before the settings blob — renders as an ordinary ungrouped plan
  // rather than vanishing from the list.
  const ungrouped = plans.filter(
    (plan) => plan.buildGroupId === undefined || !groups.some((g) => g.id === plan.buildGroupId)
  );

  function rowProps(plan: BuildPlanRecord) {
    return {
      plan,
      active: plan.id === selectedId,
      onSelect,
      onDuplicate,
      onDelete,
      onRename,
      compareMode,
      compareSelected: compareSelectedIds.has(plan.id),
      onToggleCompareSelected,
      groups,
      onMovePlan,
    };
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.title')}
        </h2>
        {compareMode ? (
          <div className="flex items-center gap-2">
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
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              icon={<Icon.ImportClipboard />}
              label={t('industry.fitImportOpen')}
              onClick={onOpenFitImport}
            />
            <IconButton
              size="sm"
              icon={<Icon.BuildGroup />}
              label={t('industry.createGroup')}
              onClick={onCreateGroup}
            />
            {/* Compare was a labelled button until the two controls above
                joined it (#626) — three labels wrapped the toolbar onto a
                second line on a phone, which is the width this list can least
                afford. */}
            {plans.length > 1 && (
              <IconButton
                size="sm"
                icon={<Icon.Compare />}
                label={t('industry.compareToggle')}
                onClick={onToggleCompareMode}
              />
            )}
          </div>
        )}
      </div>

      <BlueprintPicker catalog={catalog} onPick={onCreate} />

      {plans.length === 0 && groups.length === 0 ? (
        <EmptyState
          title={t('industry.emptyTitle')}
          hint={t('industry.emptyHint')}
          className="py-6"
        />
      ) : (
        // The scroller is the row list alone, not the whole pane: the heading
        // and the blueprint picker stay put while a long plan list scrolls
        // under them, same as Mail's list.
        <ul className="max-h-[28rem] overflow-y-auto rounded-xs border border-line">
          {/* A group's header and its members are siblings in this one list,
              not a nested `ul` per group: a nested list announces "list, 1
              item" before every single plan. */}
          {groups.map((group) => {
            const members = plans.filter((plan) => plan.buildGroupId === group.id);
            const selectedCount = members.filter((p) => compareSelectedIds.has(p.id)).length;
            return (
              <Fragment key={group.id}>
                <GroupHeader
                  group={group}
                  memberCount={members.length}
                  expanded={expandedGroupIds.has(group.id)}
                  active={group.id === selectedGroupId}
                  compareMode={compareMode}
                  membersSelected={
                    members.length > 0 && selectedCount === members.length
                      ? 'all'
                      : selectedCount > 0
                        ? 'some'
                        : 'none'
                  }
                  onToggle={() => onToggleGroup(group.id)}
                  onSelect={() => onSelectGroup(group.id)}
                  onRename={(name) => onRenameGroup(group.id, name)}
                  onDelete={() => onDeleteGroup(group.id)}
                  onToggleAllMembers={(selected) => {
                    // Toggled one row at a time, through the very callback a
                    // row's own checkbox uses, so the header can never write a
                    // selection the rows disagree with.
                    for (const member of members) {
                      if (compareSelectedIds.has(member.id) !== selected) {
                        onToggleCompareSelected(member.id);
                      }
                    }
                  }}
                />
                {expandedGroupIds.has(group.id) &&
                  members.map((plan) => <PlanRow key={plan.id} {...rowProps(plan)} indented />)}
              </Fragment>
            );
          })}
          {ungrouped.map((plan) => (
            <PlanRow key={plan.id} {...rowProps(plan)} />
          ))}
        </ul>
      )}
    </div>
  );
}
