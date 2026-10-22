/**
 * The Character switcher beside the rail's (and the More sheet's) Character
 * link: every Character with how many Permissions it has granted, one press to
 * switch, and "Fix…" on any with Permissions missing, which switches to it and
 * opens Settings › Permissions. The link itself still goes to the Characters
 * page; this sits next to it, so a pilot with several Characters changes the
 * active one without leaving the page. Absent with a single Character.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ProgressBar,
} from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { pickerTone } from '@/features/permissions/permissionCounts';
import { useCharacterPermissionCounts } from '@/features/permissions/useCharacterPermissionCounts';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { grantMissingPath } from './grantMissingPath';

export function CharacterSwitcher({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called when Fix… or Manage characters leaves the page, so a sheet the switcher sits in can close. */
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rows = useCharacterPermissionCounts();
  const activeId = useActiveCharacter((state) => state.activeCharacterId);
  if (rows === undefined || rows.length < 2) return null;
  const needsAttention = rows.some(
    (row) => row.characterId === activeId && row.granted < row.total
  );

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
          className={cx('relative shrink-0', className)}
          icon={
            <>
              <Icon.AllCharacters />
              {needsAttention && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-2 rounded-full bg-warning"
                />
              )}
            </>
          }
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[90vw] p-0">
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {rows.map((row) => {
            const active = row.characterId === activeId;
            const missing = row.total - row.granted;
            return (
              <li key={row.characterId} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => pick(row.characterId)}
                  className={cx(
                    'flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left md:min-h-9 touch:min-h-11',
                    rowInteractiveClassName,
                    active && 'bg-panel-2'
                  )}
                >
                  <CharacterAvatar characterId={row.characterId} size="sm" selected={active} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{row.name}</span>
                    <span className="flex items-center gap-2">
                      <ProgressBar
                        label={row.name}
                        value={row.granted}
                        max={row.total}
                        tone={pickerTone(row)}
                        size="xs"
                        className="w-14"
                      />
                      <span className="text-xs tabular-nums text-text-dim">
                        {t('settings.permissions.character.count', {
                          granted: row.granted,
                          total: row.total,
                        })}
                      </span>
                    </span>
                  </span>
                  {active && <Pill>{t('nav.characterActive')}</Pill>}
                </button>
                {missing > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('nav.fixPermissionsFor', { name: row.name })}
                    onClick={() =>
                      pick(row.characterId, () => {
                        onNavigate?.();
                        navigate(grantMissingPath([]));
                      })
                    }
                  >
                    {t('nav.fixPermissions')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line px-3 py-2 text-xs">
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
