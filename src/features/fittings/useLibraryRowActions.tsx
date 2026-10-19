/**
 * A saved or In-game Fitting's row menu — the Start screen's list, My
 * Fittings and In-game Fittings: Open, Compare with, Duplicate, Copy EFT,
 * Copy permanent link, Save to EVE, Rename, Delete. Right-click (or
 * touch-and-hold) the row, or its ⋮ button.
 *
 * A row names a Fitting without holding one: a saved row has only its Share
 * Link code, an In-game one ESI's own shape. Each action that needs the
 * Fitting itself works it out when chosen, never while the list renders.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '@/components/ui';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import {
  shareMarker,
  shareMenuMode,
  type SharedFittingKey,
} from '@/engine/communities/sharedFittings';
import type { CommunitySummary } from '@/features/communities/communityStore';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fittings/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { writeToClipboard } from '@/lib/clipboard';
import { exportFitting } from './fittingExportText';
import { fittingCompareHref } from './fittingRoutes';
import { saveFitting } from './myFittings';
import { useOnline } from '@/stores/network';
import type { LibraryRow } from './useLibraryFittings';
import { useTimedToast, NOTICE_MS } from '@/components/ui/useTimedToast';
import { LazySaveToEveDialog } from './LazySaveToEveDialog';

/** The row's Fitting and its Fitting Share Code (null when too large for one); null when a saved code no longer decodes. */
async function rowFitting(
  row: LibraryRow
): Promise<{ fitting: Fitting; code: string | null } | null> {
  if (row.source === 'saved' || row.source === 'shared') {
    const code = row.source === 'saved' ? row.record.code : row.shared.code;
    const decoded = await decodeFittingShare(code);
    if (!decoded.ok) return null;
    return { fitting: shareToFitting(decoded.value, row.name), code };
  }
  const { fitting } = esiFittingToFitting(row.inGame);
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  return { fitting, code: encoded.ok ? encoded.payload : null };
}

/** The Communities this Character is in, and which Fittings it already shared (issue #3605). */
export interface LibrarySharing {
  communities: readonly CommunitySummary[];
  /** `shareMarker`s of what is already shared. */
  mine: ReadonlySet<string>;
  /** Called after a share or unshare lands, so the list can refetch. */
  onChanged: () => void;
}

/** What names a Fitting to the Communities: a saved record's id, or an In-game Fitting's ESI id. */
function shareKeyOf(row: LibraryRow): SharedFittingKey | null {
  if (row.source === 'saved') return { source: 'saved', key: row.record.id };
  if (row.source === 'inGame') return { source: 'game', key: String(row.inGame.fitting_id) };
  return null;
}

interface LibraryRowActionsOptions {
  characterId: number | null;
  sharing?: LibrarySharing;
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
  sharing,
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
  const online = useOnline();
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ fitting: Fitting; description: string } | null>(null);
  useTimedToast(notice, () => setNotice(null), NOTICE_MS);

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

  async function copy(row: LibraryRow, kind: 'eft' | 'permanentLink') {
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

  async function toggleShare(row: LibraryRow, community: CommunitySummary, key: SharedFittingKey) {
    if (characterId === null || !sharing) return;
    const already = sharing.mine.has(shareMarker(community.id, key));
    await withFitting(row, async ({ code }) => {
      const shared = await import('@/features/communities/sharedFittings');
      const outcome = await shared.toggleShare(
        characterId,
        community.id,
        key,
        { name: row.name, code },
        already
      );
      setNotice(t(`fittings.share.${outcome}`, { community: community.name }));
      if (outcome === 'shared' || outcome === 'unshared') sharing.onChanged();
    });
  }

  /** "Share to Community": one item straight to the only Community, a submenu of them when there are several, nothing when there are none. */
  function shareItems(row: LibraryRow): ReactNode {
    const key = shareKeyOf(row);
    if (!sharing || key === null || characterId === null) return null;
    const label = (community: CommunitySummary) =>
      sharing.mine.has(shareMarker(community.id, key))
        ? t('fittings.share.unshareFrom', { community: community.name })
        : t('fittings.share.shareTo', { community: community.name });
    const mode = shareMenuMode(sharing.communities.length);
    if (mode === 'none') return null;
    if (mode === 'direct') {
      const [only] = sharing.communities;
      return <MenuItem onSelect={() => void toggleShare(row, only, key)}>{label(only)}</MenuItem>;
    }
    return (
      <MenuSub>
        <MenuSubTrigger>{t('fittings.share.shareToCommunity')}</MenuSubTrigger>
        <MenuSubContent>
          {sharing.communities.map((community) => (
            <MenuItem key={community.id} onSelect={() => void toggleShare(row, community, key)}>
              {label(community)}
            </MenuItem>
          ))}
        </MenuSubContent>
      </MenuSub>
    );
  }

  function itemsFor(row: LibraryRow): ReactNode {
    const saved = row.source === 'saved' ? row : null;
    // Someone else's Fitting: open it, compare it, keep a copy. It is theirs to rename or delete.
    const shared = row.source === 'shared';
    return (
      <>
        <MenuItem onSelect={() => onOpen(row)}>{t('fittings.libraryMenu.open')}</MenuItem>
        <MenuItem
          onSelect={() =>
            void withFitting(row, ({ code }) => {
              if (code === null) setNotice(t('fittings.export.tooLarge'));
              else navigate(fittingCompareHref(`f=${encodeURIComponent(code)}`));
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
          {t(shared ? 'fittings.libraryMenu.saveCopy' : 'fittings.libraryMenu.duplicate')}
        </MenuItem>
        {!shared && <MenuSeparator />}
        {!shared && (
          <>
            <MenuItem onSelect={() => void copy(row, 'eft')}>
              {t('fittings.libraryMenu.copyEft')}
            </MenuItem>
            <MenuItem onSelect={() => void copy(row, 'permanentLink')}>
              {t('fittings.libraryMenu.copyPermanentLink')}
            </MenuItem>
          </>
        )}
        {/* An In-game Fitting is in EVE already. */}
        {saved && (
          <MenuItem
            disabled={characterId === null || canSaveToEve !== true || !online}
            onSelect={() =>
              void withFitting(row, ({ fitting }) =>
                setSaving({ fitting, description: saved.record.notes ?? '' })
              )
            }
          >
            {t('fittings.libraryMenu.saveToEve')}
          </MenuItem>
        )}
        {saved && !online && (
          <p className="max-w-64 px-3 pb-2 text-xs text-text-dim">
            {t('fittings.saveToEve.needsConnection')}
          </p>
        )}
        {shareItems(row)}
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
      <LazySaveToEveDialog
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
