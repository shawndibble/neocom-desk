import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
import type { Fitting } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import type { LibraryTab } from './FittingLibrary';
import { FittingExportItems, FittingExportMenu, FittingExportNotice } from './FittingExportMenu';
import { useFittingExport } from './useFittingExport';
import { FittingNameModal } from './SavedFittingModals';

interface FittingHeaderProps {
  fitting: Fitting;
  /** Under the name: the hull (when the name isn't just the hull) and whether it's saved. */
  subtitle: string;
  /** In-game Fittings need a Character. */
  hasCharacter: boolean;
  onLibrary: (tab: LibraryTab) => void;
  /** Opens Fitting vs Fitting compare (#1547) for this Fitting. */
  onCompare: () => void;
  /** Renames the open Fitting, independent of Save. */
  onRename: (name: string) => void;
  /** The Fitting's Jita price, for Export; null while it loads. */
  price: Appraisal | null;
  /** What its numbers are worked out under — implants, missing skills. */
  context?: ReactNode;
  save: ReactNode;
  /**
   * Below desktop, or while the Add slide-out narrows the page: the identity
   * on its own line, then what the numbers assume with Save and one ⋮ menu
   * (the Fittings menu and Export folded together) at the end.
   */
  compact?: boolean;
}

/**
 * Below desktop: the identity on its own line, then what the numbers assume
 * with Save and one ⋮ menu — the Fittings menu's items, then Export's — at
 * the end of the second.
 */
function CompactFittingHeader({
  fitting,
  price,
  identity,
  libraryItems,
  save,
  context,
}: {
  fitting: Fitting;
  price: Appraisal | null;
  identity: ReactNode;
  libraryItems: ReactNode;
  save: ReactNode;
  context?: ReactNode;
}) {
  const { t } = useTranslation();
  const exportActions = useFittingExport(fitting);
  return (
    <div className="space-y-2 rounded-xs border border-line bg-panel/85 p-2 backdrop-blur-sm">
      {identity}
      {/* Save and ⋮ end the second line, so the name keeps the whole first one. The copy notice sits before them, so the header doesn't grow and shrink with it. */}
      <div className="flex flex-wrap items-center gap-2">
        {context}
        <div className="ml-auto flex items-center gap-2">
          <FittingExportNotice notice={exportActions.notice} />
          {save}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<More />} label={t('fittings.header.moreActions')} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {libraryItems}
              <DropdownMenuSeparator />
              <p className="px-2 pt-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('fittings.export.button')}
              </p>
              <FittingExportItems actions={exportActions} price={price} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

/**
 * The open Fitting's header, one row as in mockup A (scope decision
 * `20260924-215855`): what the Fitting is, what its numbers assume, then
 * its controls — a Fittings menu for opening a different one (new from a
 * hull, Import, My Fittings, In-game), the view, Export and Save.
 */
export function FittingHeader({
  fitting,
  subtitle,
  hasCharacter,
  onLibrary,
  onCompare,
  onRename,
  price,
  context,
  save,
  compact = false,
}: FittingHeaderProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const identity = (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 ${compact ? '' : 'md:min-w-48 md:flex-none'}`}
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
          <IconButton
            size="row"
            icon={<Rename />}
            label={t('fittings.header.rename')}
            tooltip={t('fittings.header.rename')}
            onClick={() => setRenaming(true)}
          />
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
      <DropdownMenuItem onSelect={() => onLibrary('mine')}>
        {t('fittings.header.myFittings')}
      </DropdownMenuItem>
      {hasCharacter && (
        <DropdownMenuItem onSelect={() => onLibrary('ingame')}>
          {t('fittings.header.inGame')}
        </DropdownMenuItem>
      )}
    </>
  );
  const compareItem = (
    <DropdownMenuItem onSelect={onCompare}>{t('fittings.compare.entryButton')}</DropdownMenuItem>
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
          identity={identity}
          libraryItems={
            <>
              {libraryItems}
              <DropdownMenuSeparator />
              {compareItem}
            </>
          }
          save={save}
          context={context}
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
          <Button onClick={onCompare}>{t('fittings.compare.entryButton')}</Button>
          <FittingExportMenu fitting={fitting} price={price} />
          {save}
        </div>
      </div>
      {renameModal}
    </>
  );
}
