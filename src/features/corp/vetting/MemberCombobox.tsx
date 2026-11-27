import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextInput, Field, Fields } from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { Well } from '@/components/ui/Well';
import { matchParts, narrowMembers, pickable, type RosterMember } from './reviewRoster';

function useMemberLine() {
  const { t } = useTranslation();
  return (member: RosterMember): string => {
    if (member.waiting) {
      const ago = formatAge(Math.max(0, Date.now() - member.waiting.at), t);
      return member.waiting.by
        ? t('vetting.member.waitingBy', { name: member.waiting.by, ago })
        : t('vetting.member.waitingAgo', { ago });
    }
    return [
      member.title,
      member.lastSeenMs !== undefined &&
        t('vetting.member.seen', {
          ago: formatAge(Math.max(0, Date.now() - member.lastSeenMs), t),
        }),
    ]
      .filter(Boolean)
      .join(' · ');
  };
}

interface MemberComboboxProps {
  members: readonly RosterMember[];
  query: string;
  onQuery: (query: string) => void;
  onPick: (member: RosterMember) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function MemberCombobox({ members, query, onQuery, onPick, inputRef }: MemberComboboxProps) {
  const { t } = useTranslation();
  const listId = useId();
  const memberLine = useMemberLine();
  const [active, setActive] = useState(0);
  const rows = useMemo(() => narrowMembers(members, query), [members, query]);
  const none = rows.length === 0;
  const current = Math.min(active, Math.max(0, rows.length - 1));
  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [listId, current]);
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(rows.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      const row = rows[current];
      if (row && pickable(row)) onPick(row);
    } else if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      event.stopPropagation();
      onQuery('');
    }
  };
  return (
    <div className="space-y-1.5">
      <Fields variant="stacked">
        <Field label={t('vetting.member.label')}>
          <span className="relative block">
            <Icon.Search
              aria-hidden="true"
              size={Icon.ICON_SIZE.md}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-dim"
            />
            <TextInput
              ref={inputRef}
              role="combobox"
              aria-expanded={!none}
              aria-controls={none ? undefined : listId}
              aria-autocomplete="list"
              aria-activedescendant={none ? undefined : `${listId}-${current}`}
              className="w-full pl-8"
              placeholder={t('vetting.member.search', { count: members.length })}
              value={query}
              onChange={(event) => {
                onQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={keys}
              autoComplete="off"
              spellCheck={false}
            />
          </span>
        </Field>
      </Fields>
      {none ? (
        <Well size="lg" id={listId} role="status" className="space-y-1 text-sm">
          <p className="font-semibold">{t('vetting.member.noMatch', { name: query.trim() })}</p>
          <p className="text-xs text-text-dim">{t('vetting.member.noMatchHint')}</p>
        </Well>
      ) : (
        <>
          <ul
            id={listId}
            role="listbox"
            aria-label={t('vetting.member.listLabel')}
            className="max-h-64 divide-y divide-line overflow-y-auto rounded-xs border border-line bg-panel-2"
          >
            {rows.map((member, index) => {
              const off = !pickable(member);
              const parts = matchParts(member.name, query);
              return (
                <li
                  key={member.characterId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === current}
                  aria-disabled={off || undefined}
                  onClick={off ? undefined : () => onPick(member)}
                  className={cx(
                    'flex min-h-11 items-center gap-2.5 px-2.5 py-1.5',
                    off ? 'cursor-not-allowed' : cx('cursor-pointer', rowInteractiveClassName),
                    index === current &&
                      'bg-panel outline outline-1 -outline-offset-1 outline-accent'
                  )}
                >
                  <CharacterAvatar characterId={member.characterId} size="sm" loading="lazy" />
                  <span className={cx('min-w-0 flex-1', off && 'opacity-60')}>
                    <span className="block truncate text-sm font-semibold">
                      {parts.before}
                      {parts.match && <b className="font-semibold text-accent">{parts.match}</b>}
                      {parts.after}
                    </span>
                    <span className="block truncate text-xs text-text-dim">
                      {memberLine(member)}
                    </span>
                  </span>
                  {member.waiting && <Pill tone="warning">{t('vetting.member.waiting')}</Pill>}
                  {member.you && <Pill>{t('vetting.member.you')}</Pill>}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-dim" aria-live="polite">
            {query.trim() === ''
              ? t('vetting.member.countAll', { count: members.length })
              : t('vetting.member.countShown', { shown: rows.length, count: members.length })}
          </p>
        </>
      )}
    </div>
  );
}

export function PickedMember({ member, onChange }: { member: RosterMember; onChange: () => void }) {
  const { t } = useTranslation();
  const memberLine = useMemberLine();
  return (
    <div className="space-y-1">
      <span className="block text-xs text-text-dim">{t('vetting.member.label')}</span>
      <Well size="wide" className="flex items-center gap-3">
        <CharacterAvatar characterId={member.characterId} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{member.name}</span>
          <span className="block truncate text-xs text-text-dim">{memberLine(member)}</span>
        </span>
        <Button size="sm" onClick={onChange}>
          {t('vetting.member.change')}
        </Button>
      </Well>
    </div>
  );
}
