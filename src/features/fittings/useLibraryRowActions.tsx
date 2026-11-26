import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  DisabledMenuItem,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from '@/components/ui';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import {
  shareMarker,
  shareMenuMode,
  type SharedFittingKey,
} from '@/engine/communities/sharedFittings';
import type { CommunitySummary } from '@/features/communities/communityStore';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { writeToClipboard } from '@/lib/clipboard';
import { exportFitting } from './fittingExportText';
import { fittingCompareHref } from './fittingRoutes';
import { saveFitting } from './myFittings';
import { useOnline } from '@/stores/network';
import { heldFitting, libraryRowCode, type LibraryRow } from './useLibraryFittings';
import { useTimedToast, NOTICE_MS } from '@/components/ui/useTimedToast';
import { LazySaveToEveDialog } from './LazySaveToEveDialog';

async function rowFitting(
  row: LibraryRow
): Promise<{ fitting: Fitting; code: string | null } | null> {
  const code = libraryRowCode(row);
  if (code !== null) {
    const decoded = await decodeFittingShare(code);
    if (!decoded.ok) return null;
    return { fitting: shareToFitting(decoded.value, row.name), code };
  }
  const fitting = heldFitting(row)!;
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  return { fitting, code: encoded.ok ? encoded.payload : null };
}

export interface LibrarySharing {
  communities: readonly CommunitySummary[];
  mine: ReadonlySet<string>;
  onChanged: () => void;
}

function shareKeyOf(row: LibraryRow): SharedFittingKey | null {
  if (row.source === 'saved') return { source: 'saved', key: row.record.id };
  if (row.source === 'inGame') return { source: 'game', key: String(row.inGame.fitting_id) };
  return null;
}

interface LibraryRowActionsOptions {
  characterId: number | null;
  sharing?: LibrarySharing;
  onOpen: (row: LibraryRow) => void;
  onRename?: (row: Extract<LibraryRow, { source: 'saved' }>) => void;
  onDelete?: (row: Extract<LibraryRow, { source: 'saved' }>) => void;
}

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
    const shared = row.source === 'shared' || row.source === 'doctrine';
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
        {characterId === null ? (
          <DisabledMenuItem reason={t('fittings.libraryMenu.needsCharacter')}>
            {t(shared ? 'fittings.libraryMenu.saveCopy' : 'fittings.libraryMenu.duplicate')}
          </DisabledMenuItem>
        ) : (
          <MenuItem
            onSelect={() =>
              void withFitting(row, async ({ code }) => {
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
        )}
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
        {saved &&
          (characterId === null || canSaveToEve !== true || !online ? (
            <DisabledMenuItem
              reason={
                characterId === null
                  ? t('fittings.libraryMenu.needsCharacter')
                  : canSaveToEve !== true
                    ? t('fittings.libraryMenu.saveToEveUnavailable')
                    : t('fittings.saveToEve.needsConnection')
              }
            >
              {t('fittings.libraryMenu.saveToEve')}
            </DisabledMenuItem>
          ) : (
            <MenuItem
              onSelect={() =>
                void withFitting(row, ({ fitting }) =>
                  setSaving({ fitting, description: saved.record.notes ?? '' })
                )
              }
            >
              {t('fittings.libraryMenu.saveToEve')}
            </MenuItem>
          ))}
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
