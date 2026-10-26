import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { grantMissingPath } from '@/app/grantMissingPath';
import type { ScopeGroup } from '@/esi/registry';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  SplitButtonChevron,
} from '@/components/ui';
import { isApplePlatform, modChordDisplayKey } from '@/lib/shortcuts';
import { useChord } from '@/lib/useChord';

interface FittingSaveButtonProps {
  /** Save (or update) to My Fittings — the button itself. */
  onSave: () => void;
  canSave: boolean;
  /** Why Save is off, when it is. */
  saveBlockedReason?: string;
  /** The Fitting came from a My Fittings record, so Save updates it. */
  updating: boolean;
  /** Saves what's on screen as a new My Fittings record, leaving the one it came from untouched. Only offered once there's an original to keep (`updating`). */
  onSaveAsNew: () => void;
  onSaveToEve: () => void;
  canSaveToEve: boolean;
  saveToEveBlockedReason?: string;
  /** The Permissions Save to EVE lacks: lists a "Grant missing Permissions" item under it. */
  saveToEveMissingGroups?: readonly ScopeGroup[];
}

/**
 * Save as one split button (mockup A): the button saves to My Fittings — the
 * everyday save, named in its tooltip — and its caret lists every destination,
 * that one first, then Save to EVE, the rarer export that opens its own
 * dialog.
 */
export function FittingSaveButton({
  onSave,
  canSave,
  saveBlockedReason,
  updating,
  onSaveAsNew,
  onSaveToEve,
  canSaveToEve,
  saveToEveBlockedReason,
  saveToEveMissingGroups = [],
}: FittingSaveButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const apple = isApplePlatform();
  // Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S saves a copy — in any field too. Both
  // always swallow the browser's own "save page", even while Save is off.
  useChord('s', onSave, { enabled: canSave });
  useChord('s', onSaveAsNew, { shift: true, enabled: canSave && updating });
  const destination = updating
    ? t('fittings.myFittings.updateDestination')
    : t('fittings.myFittings.saveDestination');
  const withReason = (button: ReactElement<{ className?: string }>) =>
    !canSave && saveBlockedReason ? (
      <Tooltip content={saveBlockedReason}>{button}</Tooltip>
    ) : (
      <Tooltip content={`${destination} · ${modChordDisplayKey(apple, 'S')}`}>{button}</Tooltip>
    );
  return (
    <div className="flex">
      {/* `aria-disabled`, not the native attribute, so the reason stays reachable. */}
      {withReason(
        <Button
          variant="primary"
          aria-label={destination}
          aria-disabled={!canSave || undefined}
          aria-keyshortcuts={apple ? 'Meta+S' : 'Control+S'}
          onClick={onSave}
          className="rounded-r-none"
        >
          {updating ? t('fittings.myFittings.update') : t('fittings.myFittings.save')}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SplitButtonChevron label={t('fittings.header.moreSave')} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem disabled={!canSave} onSelect={onSave}>
            {destination}
            <span className="ml-auto pl-4 text-text-dim">{modChordDisplayKey(apple, 'S')}</span>
          </DropdownMenuItem>
          {updating && (
            <>
              <DropdownMenuItem disabled={!canSave} onSelect={onSaveAsNew}>
                {t('fittings.myFittings.saveAsNew')}
                <span className="ml-auto pl-4 text-text-dim">
                  {modChordDisplayKey(apple, 'S', { shift: true })}
                </span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canSaveToEve} onSelect={onSaveToEve}>
            {t('fittings.saveToEve.action')}
          </DropdownMenuItem>
          {!canSaveToEve && saveToEveMissingGroups.length > 0 && (
            <DropdownMenuItem onSelect={() => navigate(grantMissingPath(saveToEveMissingGroups))}>
              {t('permissions.grantMissing')}
            </DropdownMenuItem>
          )}
          {!canSaveToEve && saveToEveBlockedReason && (
            <p className="max-w-64 px-3 pb-2 text-xs text-text-dim">{saveToEveBlockedReason}</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
