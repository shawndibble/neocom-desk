import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  onSaveToEve: () => void;
  canSaveToEve: boolean;
  saveToEveBlockedReason?: string;
  /** A phone says just "Save". */
  short: boolean;
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
  onSaveToEve,
  canSaveToEve,
  saveToEveBlockedReason,
  short,
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
        {updating
          ? t('fittings.myFittings.update')
          : t(short ? 'fittings.myFittings.saveShort' : 'fittings.myFittings.save')}
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
