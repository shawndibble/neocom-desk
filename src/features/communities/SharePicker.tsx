import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { permissionsForEndpoints } from '@/esi/registry';
import { Button, Caret, Checkbox, EmptyState, SearchInput, Spinner } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import {
  buildShareTree,
  countSelected,
  descendantTypeIds,
  filterShareTree,
  groupState,
  selectAll,
  toggleGroup,
  toggleType,
  type BlueprintTypeInfo,
  type ShareGroup,
  type ShareMarketGroup,
} from '@/engine/communities/shareTree';
import { useOwnedBlueprintTypes } from './useOwnedBlueprintTypes';

/** A native checkbox whose partial state is the DOM `indeterminate` flag, which has no attribute. */
function GroupCheckbox({
  group,
  selected,
  onToggle,
}: {
  group: ShareGroup;
  selected: ReadonlySet<number>;
  onToggle: () => void;
}) {
  const state = groupState(group, selected);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  const chosen = descendantTypeIds(group).filter((id) => selected.has(id)).length;
  return (
    <label className={`flex min-w-0 flex-1 items-center gap-2 ${tappableRowClassName}`}>
      <Checkbox
        ref={ref}
        checked={state === 'all'}
        aria-checked={state === 'some' ? 'mixed' : state === 'all'}
        onChange={onToggle}
      />
      <span className="min-w-0 truncate text-xs font-medium">{group.name}</span>
      <span className="ml-auto text-xs text-text-dim">
        {chosen}/{group.total}
      </span>
    </label>
  );
}

function GroupNode({
  group,
  depth,
  selected,
  forceOpen,
  onChange,
}: {
  group: ShareGroup;
  depth: number;
  selected: ReadonlySet<number>;
  forceOpen: boolean;
  onChange: (next: Set<number>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const expanded = open || forceOpen;
  return (
    <li>
      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={t('communities.share.expand', { name: group.name })}
          className="grid size-7 shrink-0 place-items-center rounded-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          onClick={() => setOpen(!open)}
        >
          <Caret expanded={expanded} />
        </button>
        <GroupCheckbox
          group={group}
          selected={selected}
          onToggle={() => onChange(toggleGroup(group, selected))}
        />
      </div>
      {expanded && (
        <ul>
          {group.children.map((child) => (
            <GroupNode
              key={child.id}
              group={child}
              depth={depth + 1}
              selected={selected}
              forceOpen={forceOpen}
              onChange={onChange}
            />
          ))}
          {group.types.map((type) => (
            <li key={type.typeId} style={{ paddingLeft: (depth + 1) * 16 + 28 }}>
              <label className={`flex min-w-0 items-center gap-2 ${tappableRowClassName}`}>
                <Checkbox
                  checked={selected.has(type.typeId)}
                  onChange={() => onChange(toggleType(selected, type.typeId))}
                />
                <span className="min-w-0 truncate text-xs">{type.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Which blueprints to share with a Community (issue #3599): share all or none,
 * search by name, a market-group tree whose category checkboxes show how many
 * of their blueprints are chosen, and a checkbox per blueprint to opt it out.
 * Nothing is chosen until the Member picks. Every rule is in `shareTree`.
 */
export function SharePicker({
  owned,
  groups,
  learned,
  selected,
  onChange,
  disabled = false,
}: {
  owned: readonly BlueprintTypeInfo[];
  groups: readonly ShareMarketGroup[];
  /** `blueprintGroupOfProductGroup` over every blueprint, so unlisted ones land beside their kin. */
  learned?: ReadonlyMap<number, number>;
  selected: ReadonlySet<number>;
  onChange: (next: Set<number>) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const tree = useMemo(
    () => buildShareTree(owned, groups, t('communities.share.other'), learned),
    [owned, groups, learned, t]
  );
  const shown = useMemo(() => filterShareTree(tree, query), [tree, query]);
  const searching = query.trim() !== '';
  const count = countSelected(selected, owned);

  if (owned.length === 0) return <EmptyState title={t('communities.share.noBlueprints')} />;

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="sr-only">{t('communities.share.legend')}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-40 flex-1"
          value={query}
          placeholder={t('communities.share.search')}
          aria-label={t('communities.share.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button size="sm" onClick={() => onChange(selectAll(owned))}>
          {t('communities.share.all')}
        </Button>
        <Button size="sm" onClick={() => onChange(new Set())}>
          {t('communities.share.none')}
        </Button>
      </div>
      <p role="status" className="text-xs text-text-dim">
        {t('communities.share.count', { count, total: owned.length })}
      </p>
      {shown.length === 0 ? (
        <EmptyState title={t('communities.share.noMatch')} />
      ) : (
        <ul className="max-h-96 overflow-y-auto">
          {shown.map((group) => (
            <GroupNode
              key={group.id}
              group={group}
              depth={0}
              selected={selected}
              forceOpen={searching}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </fieldset>
  );
}

/** The picker for one Character, loading what it owns first. */
export function CharacterSharePicker({
  characterId,
  selected,
  onChange,
  disabled,
}: {
  characterId: number;
  selected: ReadonlySet<number>;
  onChange: (next: Set<number>) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const state = useOwnedBlueprintTypes(characterId);
  if (state.status === 'loading')
    return <Spinner size="sm" label={t('communities.share.loading')} />;
  if (state.status === 'needsReauth') {
    return (
      <p className="text-xs text-text-dim">
        <GrantMissingLink groups={permissionsForEndpoints(['getCharacterBlueprints'])} />
      </p>
    );
  }
  if (state.status === 'failed') {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.share.failed')}
      </p>
    );
  }
  return (
    <SharePicker
      owned={state.owned}
      groups={state.groups}
      learned={state.learned}
      selected={selected}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
