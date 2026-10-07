import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui';
import { Expanded } from '@/components/ui/icons';
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
}

/**
 * Save as one split button (mockup A): the button saves to My Fittings — the
 * everyday save — and its caret holds Save to EVE, the rarer export that
 * opens its own dialog.
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
}: FittingSaveButtonProps) {
  const { t } = useTranslation();
  const apple = isApplePlatform();
  // Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S saves a copy — in any field too. Both
  // always swallow the browser's own "save page", even while Save is off.
  useChord('s', onSave, { enabled: canSave });
  useChord('s', onSaveAsNew, { shift: true, enabled: canSave && updating });
  const withReason = (button: ReactElement<{ className?: string }>) =>
    !canSave && saveBlockedReason ? (
      <Tooltip content={saveBlockedReason}>{button}</Tooltip>
    ) : (
      <Tooltip content={modChordDisplayKey(apple, 'S')}>{button}</Tooltip>
    );
  return (
    <div className="flex">
      {/* `aria-disabled`, not the native attribute, so the reason stays reachable. */}
      {withReason(
        <Button
          variant="primary"
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
          <Button
            variant="primary"
            aria-label={t('fittings.header.moreSave')}
            className="rounded-l-none border-l border-l-accent-contrast/30 px-2"
          >
            <Expanded aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {updating && (
            <>
              <DropdownMenuItem disabled={!canSave} onSelect={onSaveAsNew}>
                {t('fittings.myFittings.saveAsNew')}
                <span className="ml-auto pl-4 text-text-dim">
                  {modChordDisplayKey(apple, 'S', { shift: true })}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem disabled={!canSaveToEve} onSelect={onSaveToEve}>
            {t('fittings.saveToEve.action')}
          </DropdownMenuItem>
          {!canSaveToEve && saveToEveBlockedReason && (
            <p className="max-w-64 px-3 pb-2 text-xs text-text-dim">{saveToEveBlockedReason}</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
