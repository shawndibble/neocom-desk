import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  NeedsConnection,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  focusRingClassName,
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { useCharacterPermissionCounts } from '@/features/permissions/useCharacterPermissionCounts';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { NeedsLoginAction } from '@/features/character/NeedsLoginAction';
import { grantMissingPath } from './grantMissingPath';
import { beginAddCharacterLogin } from './loginFlow';

export function CharacterSwitcher({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rows = useCharacterPermissionCounts();
  const activeId = useActiveCharacter((state) => state.activeCharacterId);
  if (rows === undefined || rows.length < 2) return null;

  const pick = (characterId: number, then?: () => void) => {
    void useActiveCharacter
      .getState()
      .setActiveCharacter(characterId)
      .then(() => then?.());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          label={t('nav.characterSwitcher')}
          variant="plain"
          className={cx('shrink-0', className)}
          icon={<Icon.AllCharacters />}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t('nav.characterSwitcher')}
        className="w-max min-w-56 max-w-[90vw] p-0"
      >
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {rows.map((row) => {
            const active = row.characterId === activeId;
            return (
              <li
                key={row.characterId}
                className={cx(
                  'relative flex min-h-9 items-center gap-2 px-3 py-2',
                  rowInteractiveClassName,
                  active && 'bg-panel-2'
                )}
              >
                <button
                  type="button"
                  aria-current={active || undefined}
                  aria-label={row.name}
                  onClick={() => pick(row.characterId)}
                  className={cx('absolute inset-0', focusRingInsetClassName)}
                />
                <CharacterAvatar characterId={row.characterId} size="sm" selected={active} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{row.name}</span>
                  <button
                    type="button"
                    aria-label={t('nav.permissionsFor', {
                      granted: row.granted,
                      total: row.total,
                      name: row.name,
                    })}
                    onClick={() =>
                      pick(row.characterId, () => {
                        onNavigate?.();
                        navigate(grantMissingPath([]));
                      })
                    }
                    className={cx(
                      inlineLinkClassName,
                      'relative inline-flex min-h-6 items-center p-0 text-xs tabular-nums'
                    )}
                  >
                    {t('nav.permissionsCount', { granted: row.granted, total: row.total })}
                  </button>
                </span>
                <NeedsLoginAction
                  characterId={row.characterId}
                  name={row.name}
                  className="relative"
                />
                {active && (
                  <Pill className="pointer-events-none relative">{t('nav.characterActive')}</Pill>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-xs">
          <Link
            to="/characters"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="text-accent underline"
          >
            {t('nav.manageCharacters')}
          </Link>
          <NeedsConnection>
            <button
              type="button"
              onClick={() => void beginAddCharacterLogin()}
              className={cx(
                'rounded-xs text-accent underline aria-disabled:cursor-default aria-disabled:opacity-40',
                focusRingClassName
              )}
            >
              {t('characters.add')}
            </button>
          </NeedsConnection>
        </div>
      </PopoverContent>
    </Popover>
  );
}
