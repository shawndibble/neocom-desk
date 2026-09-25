import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { Expanded } from '@/components/ui/icons';

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
  return (
    <div className="flex">
      <Button
        variant="primary"
        disabled={!canSave}
        title={saveBlockedReason}
        onClick={onSave}
        className="rounded-r-none"
      >
        {updating ? t('fittings.myFittings.update') : t('fittings.myFittings.save')}
      </Button>
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
