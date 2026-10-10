import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertsBell,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  TypeIcon,
} from '@/components/ui';
import { Expanded, More, Rename } from '@/components/ui/icons';
import { NOTICE_MS, useTimedToast } from '@/components/ui/useTimedToast';
import type { AlphaBlocker } from '@/engine/fittings/alphaClone';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { writeToClipboard } from '@/lib/clipboard';
import { AlphaCloneChip, AlphaCloneMenuRow } from './AlphaCloneChip';
import { FittingExportItems, FittingExportMenu, FittingExportNotice } from './FittingExportMenu';
import { fittingStatsText } from './fittingStatsText';
import { MasteryChip } from './MasteryChip';
import { useFittingExport } from './useFittingExport';
import { FittingNameModal } from './SavedFittingModals';

/** What the Fittings menu opens: the hull search, Import, or the list of saved and In-game Fittings. */
export type LibraryAction = 'new' | 'import' | 'open';

/** What the header's Alpha/Omega and Mastery badges show; null `mastery` is no logged-in Character. */
export interface HeaderBadges {
  alpha: {
    blockers: readonly AlphaBlocker[] | null;
    skillName: (skillTypeId: number) => string;
  };
  mastery: { hullTypeId: number; hullName: string; characterId: number } | null;
}

interface FittingHeaderProps {
  fitting: Fitting;
  /** Under the name: the hull (when the name isn't just the hull) and whether it's saved. */
  subtitle: string;
  onLibrary: (action: LibraryAction) => void;
  /** Opens Fitting vs Fitting compare (#1547) for this Fitting. */
  onCompare: () => void;
  /** Renames the open Fitting, independent of Save. */
  onRename: (name: string) => void;
  /** The Fitting's Jita price, for Export; null while it loads. */
  price: Appraisal | null;
  /** The pilot's active clone, left off Export's multibuy list. */
  cloneImplants?: readonly number[];
  /** Icon badges about the fit itself — Alpha/Omega, Mastery. What its numbers assume (implants, missing skills) lives in the stats panel. */
  badges?: HeaderBadges;
  /** The open Fitting's stats, for Copy stats; null while they load. */
  stats?: FittingStats | null;
  save: ReactNode;
  /**
   * Below desktop, or while the Add slide-out narrows the page: one row — the
   * identity, Save and one ⋮ menu (the Fittings menu, Export and the badges
   * folded together) at the end.
   */
  compact?: boolean;
}

/** "Copy stats": the headline numbers as text, with the brief notice it leaves. */
function useCopyStats(stats: FittingStats | null) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<string | null>(null);
  useTimedToast(notice, () => setNotice(null), NOTICE_MS);
  async function copy() {
    if (stats === null) return;
    try {
      await writeToClipboard(fittingStatsText(stats, t));
      setNotice(t('fittings.stats.copied'));
    } catch {
      setNotice(t('fittings.stats.copyFailed'));
    }
  }
  return { notice, copy, canCopy: stats !== null };
}

/**
 * Below desktop: one row — the identity, then Save and one ⋮ menu holding the
 * Fittings menu's items, the view, Export's and the badges (text, since a
 * menu has no hover to carry what an icon badge's tooltip says).
 */
function CompactFittingHeader({
  fitting,
  price,
  cloneImplants,
  identity,
  libraryItems,
  save,
  badges,
  stats,
  onRename,
}: {
  onRename: () => void;
  fitting: Fitting;
  price: Appraisal | null;
  cloneImplants: readonly number[] | undefined;
  identity: ReactNode;
  libraryItems: ReactNode;
  save: ReactNode;
  badges?: HeaderBadges;
  stats: FittingStats | null;
}) {
  const { t } = useTranslation();
  const exportActions = useFittingExport(fitting, cloneImplants);
  const copyStats = useCopyStats(stats);
  const [masteryOpen, setMasteryOpen] = useState(false);
  const [masteryAvailable, setMasteryAvailable] = useState(false);
  const mastery = badges?.mastery ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel/85 p-2 backdrop-blur-sm">
      {/* The name takes what Save and ⋮ leave, down to a basis that wraps them under it rather than squeeze it away. */}
      {identity}
      {/* The copy notices sit before Save and ⋮, so the header doesn't grow and shrink with them. */}
      <div className="ml-auto flex items-center gap-2">
        <FittingExportNotice notice={exportActions.notice ?? copyStats.notice} />
        {save}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<More />} label={t('fittings.header.moreActions')} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem onSelect={onRename}>{t('fittings.header.rename')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            {libraryItems}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!copyStats.canCopy} onSelect={() => void copyStats.copy()}>
              {t('fittings.stats.copy')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="px-2 pt-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('fittings.export.button')}
            </p>
            <FittingExportItems actions={exportActions} price={price} />
            {badges && (
              <>
                <DropdownMenuSeparator />
                <AlphaCloneMenuRow {...badges.alpha} />
                {mastery && masteryAvailable && (
                  <DropdownMenuItem onSelect={() => setMasteryOpen(true)}>
                    {t('fittings.mastery.menuItem')}
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Outside the menu, which unmounts its contents when it closes: the Mastery sheet outlives the tap that opened it. */}
        {mastery && (
          <MasteryChip
            presentation="dialog"
            open={masteryOpen}
            onOpenChange={setMasteryOpen}
            onAvailable={setMasteryAvailable}
            {...mastery}
          />
        )}
        {/* This header stands in for `PageHeader`, which carries the bell elsewhere. */}
        <AlertsBell />
      </div>
    </div>
  );
}

/**
 * The open Fitting's header, one row (scope decisions `20260924-215855`,
 * then `20260926-155124`): what the Fitting is with its icon badges, then
 * its controls — a Fittings menu for opening a different one (new from a
 * hull, Import, My Fittings, In-game), the view, Export and Save.
 */
export function FittingHeader({
  fitting,
  subtitle,
  onLibrary,
  onCompare,
  onRename,
  price,
  cloneImplants,
  badges,
  stats = null,
  save,
  compact = false,
}: FittingHeaderProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const copyStats = useCopyStats(stats);
  const identity = (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 ${compact ? 'basis-32' : 'md:min-w-48 md:flex-none'}`}
    >
      <TypeIcon
        typeId={fitting.shipTypeId}
        size={64}
        width={compact ? 40 : 44}
        height={compact ? 40 : 44}
        className="shrink-0 border border-line"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <h1
            className={`text-lg font-semibold ${compact ? 'line-clamp-2 break-words' : 'truncate'}`}
          >
            {fitting.name}
          </h1>
          {/* The one-row phone header gives the name this room; Rename is in its ⋮ menu instead. */}
          {!compact && (
            <IconButton
              variant="plain"
              size="row"
              icon={<Rename />}
              label={t('fittings.header.rename')}
              tooltip={t('fittings.header.rename')}
              onClick={() => setRenaming(true)}
            />
          )}
        </div>
        {subtitle && <p className="truncate text-xs text-text-dim">{subtitle}</p>}
      </div>
    </div>
  );

  const libraryItems = (
    <>
      <DropdownMenuItem onSelect={() => onLibrary('new')}>
        {t('fittings.header.newFromHull')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onLibrary('import')}>
        {t('fittings.header.import')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onLibrary('open')}>
        {t('fittings.header.openFitting')}
      </DropdownMenuItem>
    </>
  );
  const compareItem = (
    <DropdownMenuItem onSelect={onCompare}>{t('fittings.compare.entryButton')}</DropdownMenuItem>
  );
  const context = badges && (
    <>
      <AlphaCloneChip {...badges.alpha} />
      {badges.mastery && <MasteryChip {...badges.mastery} />}
    </>
  );

  const renameModal = (
    <FittingNameModal
      open={renaming}
      name={fitting.name}
      resetKey={renaming ? fitting.name : null}
      onSubmit={onRename}
      onClose={() => setRenaming(false)}
    />
  );

  if (compact) {
    return (
      <>
        <CompactFittingHeader
          fitting={fitting}
          price={price}
          cloneImplants={cloneImplants}
          identity={identity}
          libraryItems={
            <>
              {libraryItems}
              <DropdownMenuSeparator />
              {compareItem}
            </>
          }
          save={save}
          badges={badges}
          stats={stats}
          onRename={() => setRenaming(true)}
        />
        {renameModal}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xs border border-line bg-panel/85 px-3 py-2 backdrop-blur-sm">
        {identity}
        {context && <div className="flex flex-wrap items-center gap-3">{context}</div>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                {t('fittings.header.menu')}
                <Expanded aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {libraryItems}
            </DropdownMenuContent>
          </DropdownMenu>
          <FittingExportMenu fitting={fitting} price={price} cloneImplants={cloneImplants} />
          {save}
          <FittingExportNotice notice={copyStats.notice} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<More />} label={t('fittings.header.moreActions')} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {compareItem}
              <DropdownMenuItem
                disabled={!copyStats.canCopy}
                onSelect={() => void copyStats.copy()}
              >
                {t('fittings.stats.copy')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {renameModal}
    </>
  );
}
