/**
 * A saved or In-game Fitting's row menu — the Start screen's list, My
 * Fittings and In-game Fittings: Open, Compare with, Duplicate, Copy EFT,
 * Copy Share Link, Save to EVE, Rename, Delete. Right-click (or
 * touch-and-hold) the row, or its ⋮ button.
 *
 * A row names a Fitting without holding one: a saved row has only its Share
 * Link code, an In-game one ESI's own shape. Each action that needs the
 * Fitting itself works it out when chosen, never while the list renders.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MenuItem, MenuSeparator } from '@/components/ui';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fitting/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { writeToClipboard } from '@/lib/clipboard';
import { exportFitting } from './fittingExportText';
import { saveFitting } from './myFittings';
import { SaveToEveDialog } from './SaveToEveDialog';
import type { LibraryRow } from './useLibraryFittings';

const NOTICE_MS = 2500;

/** The row's Fitting and its Share Link code (null when too large for one); null when a saved code no longer decodes. */
async function rowFitting(
  row: LibraryRow
): Promise<{ fitting: Fitting; code: string | null } | null> {
  if (row.source === 'saved') {
    const decoded = await decodeFittingShare(row.record.code);
    if (!decoded.ok) return null;
    return { fitting: shareToFitting(decoded.value, row.record.name), code: row.record.code };
  }
  const { fitting } = esiFittingToFitting(row.inGame);
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  return { fitting, code: encoded.ok ? encoded.payload : null };
}

interface LibraryRowActionsOptions {
  characterId: number | null;
  onOpen: (row: LibraryRow) => void;
  /** Saved rows only. */
  onRename?: (row: Extract<LibraryRow, { source: 'saved' }>) => void;
  onDelete?: (row: Extract<LibraryRow, { source: 'saved' }>) => void;
}

/**
 * The menu's items for any row, the Save to EVE dialog they open, and the
 * notice a copy leaves — the list renders `dialog` once and `notice` in a
 * status line.
 */
export function useLibraryRowActions({
  characterId,
  onOpen,
  onRename,
  onDelete,
}: LibraryRowActionsOptions): {
  itemsFor: (row: LibraryRow) => ReactNode;
  dialog: ReactNode;
  notice: string | null;
} {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canSaveToEve = useEndpointsGranted(['postCharacterFitting']);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ fitting: Fitting; description: string } | null>(null);
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function withFitting(
    row: LibraryRow,
    then: (resolved: { fitting: Fitting; code: string | null }) => Promise<void> | void
  ) {
    const resolved = await rowFitting(row);
    if (resolved === null) {
      setNotice(t('fittings.libraryMenu.unreadable'));
      return;
    }
    await then(resolved);
  }

  async function copy(row: LibraryRow, kind: 'eft' | 'shareLink') {
    await withFitting(row, async ({ fitting }) => {
      try {
        const text = await exportFitting(kind, fitting);
        if (text === null) {
          setNotice(t('fittings.export.tooLarge'));
          return;
        }
        await writeToClipboard(text);
        setNotice(t(`fittings.export.copied.${kind}`));
      } catch {
        setNotice(t('fittings.export.copyFailed'));
      }
    });
  }

  function itemsFor(row: LibraryRow): ReactNode {
    const saved = row.source === 'saved' ? row : null;
    return (
      <>
        <MenuItem onSelect={() => onOpen(row)}>{t('fittings.libraryMenu.open')}</MenuItem>
        <MenuItem
          onSelect={() =>
            void withFitting(row, ({ code }) => {
              if (code === null) setNotice(t('fittings.export.tooLarge'));
              else navigate(`/fittings/compare?f=${encodeURIComponent(code)}`);
            })
          }
        >
          {t('fittings.libraryMenu.compare')}
        </MenuItem>
        <MenuItem
          disabled={characterId === null}
          onSelect={() =>
            void withFitting(row, async ({ code }) => {
              if (characterId === null) return;
              if (code === null) {
                setNotice(t('fittings.myFittings.tooLarge'));
                return;
              }
              await saveFitting(characterId, {
                name: t('fittings.myFittings.saveAsNewDefaultName', { name: row.name }),
                code,
                ...(saved?.record.notes ? { notes: saved.record.notes } : {}),
              });
              setNotice(t('fittings.libraryMenu.duplicated', { name: row.name }));
            })
          }
        >
          {t('fittings.libraryMenu.duplicate')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => void copy(row, 'eft')}>
          {t('fittings.libraryMenu.copyEft')}
        </MenuItem>
        <MenuItem onSelect={() => void copy(row, 'shareLink')}>
          {t('fittings.libraryMenu.copyShareLink')}
        </MenuItem>
        {/* An In-game Fitting is in EVE already. */}
        {saved && (
          <MenuItem
            disabled={characterId === null || canSaveToEve !== true}
            onSelect={() =>
              void withFitting(row, ({ fitting }) =>
                setSaving({ fitting, description: saved.record.notes ?? '' })
              )
            }
          >
            {t('fittings.libraryMenu.saveToEve')}
          </MenuItem>
        )}
        {saved && (onRename || onDelete) && <MenuSeparator />}
        {saved && onRename && (
          <MenuItem onSelect={() => onRename(saved)}>{t('fittings.libraryMenu.rename')}</MenuItem>
        )}
        {saved && onDelete && (
          <MenuItem className="text-danger" onSelect={() => onDelete(saved)}>
            {t('fittings.libraryMenu.delete')}
          </MenuItem>
        )}
      </>
    );
  }

  const dialog =
    saving !== null && characterId !== null ? (
      <SaveToEveDialog
        open
        onClose={() => setSaving(null)}
        characterId={characterId}
        fitting={saving.fitting}
        description={saving.description}
        onSaved={() => setNotice(t('fittings.libraryMenu.savedToEve'))}
      />
    ) : null;

  return { itemsFor, dialog, notice };
}
