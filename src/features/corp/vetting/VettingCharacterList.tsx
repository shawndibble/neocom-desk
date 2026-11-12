import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Spinner, textActionClassName } from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { VettingSource } from '@/engine/vetting';
import { cx } from '@/lib/cx';
import { formatList } from '@/lib/listFormat';

/**
 * `read`: the server read it. `reading`: that read is running. `partMissing`: read, but a
 * source was not shared. `ready`: signed in on this device, not read yet. `needsSignIn`: on this
 * device, but its sign-in does not cover what the report reads.
 */
export type VettingRowState = 'read' | 'reading' | 'partMissing' | 'ready' | 'needsSignIn';

export interface VettingCharacterRow {
  characterId: number;
  name: string;
  corporationName?: string;
  state: VettingRowState;
  /** What was not shared, for `partMissing` and `needsSignIn`. */
  missing?: readonly VettingSource[];
}

const TONE: Record<VettingRowState, PillTone> = {
  read: 'success',
  reading: 'neutral',
  partMissing: 'warning',
  ready: 'neutral',
  needsSignIn: 'warning',
};

interface VettingCharacterListProps {
  rows: readonly VettingCharacterRow[];
  /** Checkboxes, for a member choosing which device characters to share. */
  tick?: { checked: ReadonlySet<number>; onToggle: (characterId: number) => void };
  onRemove?: (row: VettingCharacterRow) => void;
  /** Runs the EVE sign-in again for a row that is missing something. */
  onSignIn?: (row: VettingCharacterRow) => void;
  /** A change is running: the row actions do nothing meanwhile. */
  busy?: boolean;
}

/** The pilot's characters in a report: portrait, name, corporation, read state, and how to fix it. */
export function VettingCharacterList({
  rows,
  tick,
  onRemove,
  onSignIn,
  busy = false,
}: VettingCharacterListProps) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const needsFix = row.state === 'partMissing' || row.state === 'needsSignIn';
        const missing = formatList((row.missing ?? []).map((id) => t(`vetting.sources.${id}`)));
        const canRemove = onRemove !== undefined && row.state !== 'reading';
        return (
          <li
            key={row.characterId}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
          >
            {tick && (
              <label className={touchCheckboxLabelClassName}>
                <Checkbox
                  aria-label={t('vetting.characters.share', { name: row.name })}
                  checked={tick.checked.has(row.characterId)}
                  disabled={row.state !== 'ready'}
                  onChange={() => tick.onToggle(row.characterId)}
                />
              </label>
            )}
            <CharacterAvatar characterId={row.characterId} loading="lazy" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{row.name}</span>
              {row.corporationName && (
                <span className="block truncate text-xs text-text-dim">{row.corporationName}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {row.state === 'reading' && (
                <Spinner size="sm" label={t('vetting.characters.state.reading')} />
              )}
              <Pill tone={TONE[row.state]}>{t(`vetting.characters.state.${row.state}`)}</Pill>
            </span>
            {canRemove && !needsFix && (
              <button
                type="button"
                className={cx(textActionClassName(), 'text-xs')}
                aria-label={t('vetting.characters.removeNamed', { name: row.name })}
                onClick={busy ? undefined : () => onRemove(row)}
                aria-disabled={busy || undefined}
              >
                {t('vetting.characters.remove')}
              </button>
            )}
            {needsFix && (
              <p className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
                <span>
                  {row.state === 'needsSignIn'
                    ? t('vetting.characters.needsSignInHint', { missing })
                    : t('vetting.characters.partMissingHint', { missing })}
                </span>
                {onSignIn && (
                  // Goes to EVE's login page, so a Button (DESIGN.md §6c); Remove acts in place.
                  <Button
                    size="sm"
                    aria-label={t('vetting.characters.signInAgainNamed', { name: row.name })}
                    onClick={busy ? undefined : () => onSignIn(row)}
                    aria-disabled={busy || undefined}
                  >
                    {t(
                      row.state === 'needsSignIn'
                        ? 'vetting.characters.signIn'
                        : 'vetting.characters.signInAgain'
                    )}
                  </Button>
                )}
                {canRemove && (
                  <button
                    type="button"
                    className={textActionClassName()}
                    aria-label={t('vetting.characters.removeNamed', { name: row.name })}
                    onClick={busy ? undefined : () => onRemove(row)}
                    aria-disabled={busy || undefined}
                  >
                    {t('vetting.characters.remove')}
                  </button>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
