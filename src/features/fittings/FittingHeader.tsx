import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertsBell,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DisabledMenuItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  TypeIcon,
  useOpenAfterMenu,
} from '@/components/ui';
import { MenuKindContext } from '@/components/ui/rowActionsContext';
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
import type { EditorShare } from './useEditorShare';
import { useFittingExport } from './useFittingExport';
import { FittingNameModal } from './SavedFittingModals';

export type LibraryAction = 'new' | 'import' | 'open';

interface HeaderBadges {
  alpha?: {
    blockers: readonly AlphaBlocker[] | null;
    skillName: (skillTypeId: number) => string;
  };
  mastery: { hullTypeId: number; hullName: string; characterId: number } | null;
}

interface FittingHeaderProps {
  fitting: Fitting;
  subtitle: string;
  onLibrary: (action: LibraryAction) => void;
  onCompare: () => void;
  onImprove?: () => void;
  unflyable?: boolean;
  onRename: (name: string) => void;
  price: Appraisal | null;
  cloneImplants?: readonly number[];
  badges?: HeaderBadges;
  stats?: FittingStats | null;
  share?: EditorShare;
  save: ReactNode;
  compact?: boolean;
}

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

function CopyStatsMenuItem({ copyStats }: { copyStats: ReturnType<typeof useCopyStats> }) {
  const { t } = useTranslation();
  if (!copyStats.canCopy) {
    return (
      <MenuKindContext.Provider value="dropdown">
        <DisabledMenuItem reason={t('fittings.stats.copyLoading')}>
          {t('fittings.stats.copy')}
        </DisabledMenuItem>
      </MenuKindContext.Provider>
    );
  }
  return (
    <DropdownMenuItem onSelect={() => void copyStats.copy()}>
      {t('fittings.stats.copy')}
    </DropdownMenuItem>
  );
}

function CompactFittingHeader({
  fitting,
  price,
  cloneImplants,
  identity,
  libraryItems,
  save,
  badges,
  stats,
  share,
  onRename,
  improveItem,
  onMenuCloseAutoFocus,
}: {
  improveItem: ReactNode;
  onMenuCloseAutoFocus: (event: Event) => void;
  share?: EditorShare;
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
      {identity}
      <div className="ml-auto flex items-center gap-2">
        <FittingExportNotice
          notice={exportActions.notice ?? copyStats.notice ?? share?.notice ?? null}
        />
        {save}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<More />} label={t('fittings.header.moreActions')} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            onCloseAutoFocus={onMenuCloseAutoFocus}
          >
            <DropdownMenuItem onSelect={onRename}>{t('fittings.header.rename')}</DropdownMenuItem>
            {improveItem}
            <DropdownMenuSeparator />
            {libraryItems}
            <DropdownMenuSeparator />
            <CopyStatsMenuItem copyStats={copyStats} />
            <DropdownMenuSeparator />
            <p className={cx(eyebrowClassName, 'px-2 pt-1')}>{t('fittings.export.button')}</p>
            <FittingExportItems actions={exportActions} price={price} share={share?.items} />
            {badges && (
              <>
                <DropdownMenuSeparator />
                {badges.alpha && <AlphaCloneMenuRow {...badges.alpha} />}
                {mastery && masteryAvailable && (
                  <DropdownMenuItem onSelect={() => setMasteryOpen(true)}>
                    {t('fittings.mastery.menuItem')}
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {mastery && (
          <MasteryChip
            presentation="dialog"
            open={masteryOpen}
            onOpenChange={setMasteryOpen}
            onAvailable={setMasteryAvailable}
            {...mastery}
          />
        )}
        <AlertsBell />
      </div>
    </div>
  );
}

export function FittingHeader({
  fitting,
  subtitle,
  onLibrary,
  onCompare,
  onImprove,
  unflyable = false,
  onRename,
  price,
  cloneImplants,
  badges,
  stats = null,
  share,
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
  const improveMenu = useOpenAfterMenu();
  const improveItem = onImprove && (
    <DropdownMenuItem onSelect={() => improveMenu.run(onImprove)}>
      {t(unflyable ? 'fittings.improve.fixMenuItem' : 'fittings.improve.menuItem')}
    </DropdownMenuItem>
  );
  const context = badges && (
    <>
      {badges.alpha && <AlphaCloneChip {...badges.alpha} />}
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
          share={share}
          onRename={() => setRenaming(true)}
          improveItem={improveItem}
          onMenuCloseAutoFocus={improveMenu.onCloseAutoFocus}
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
          {onImprove && (
            <Button onClick={onImprove}>
              {t(unflyable ? 'fittings.improve.fixButton' : 'fittings.improve.button')}
            </Button>
          )}
          <FittingExportMenu
            fitting={fitting}
            price={price}
            cloneImplants={cloneImplants}
            share={share}
          />
          {save}
          <FittingExportNotice notice={copyStats.notice} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<More />} label={t('fittings.header.moreActions')} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {compareItem}
              <CopyStatsMenuItem copyStats={copyStats} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {renameModal}
    </>
  );
}
