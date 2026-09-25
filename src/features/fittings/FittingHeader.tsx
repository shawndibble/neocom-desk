import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TypeIcon,
} from '@/components/ui';
import { Expanded } from '@/components/ui/icons';
import type { Fitting } from '@/engine/fittings/types';
import type { LibraryTab } from './FittingLibrary';

interface FittingHeaderProps {
  fitting: Fitting;
  /** Under the name: the hull (when the name isn't just the hull) and whether it's saved. */
  subtitle: string;
  /** In-game Fittings need a Character. */
  hasCharacter: boolean;
  onLibrary: (tab: LibraryTab) => void;
  /** What its numbers are worked out under — implants, missing skills. */
  context?: ReactNode;
  /** View toggle, Export, Save — right-aligned after the Fittings menu. */
  actions: ReactNode;
}

/**
 * The open Fitting's header, one row as in mockup A (scope decision
 * `20260924-215855`): what the Fitting is, what its numbers assume, then
 * its controls — a Fittings menu for opening a different one (new from a
 * hull, Import, My Fittings, In-game), the view, Export and Save. On a
 * narrow screen the groups wrap onto their own lines.
 */
export function FittingHeader({
  fitting,
  subtitle,
  hasCharacter,
  onLibrary,
  context,
  actions,
}: FittingHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xs border border-line bg-panel/85 px-3 py-2 backdrop-blur-sm">
      <div className="flex min-w-48 items-center gap-3">
        <TypeIcon
          typeId={fitting.shipTypeId}
          size={64}
          width={44}
          height={44}
          className="border border-line"
        />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{fitting.name}</h1>
          {subtitle && <p className="truncate text-xs text-text-dim">{subtitle}</p>}
        </div>
      </div>
      {context && <div className="flex flex-wrap items-center gap-3">{context}</div>}
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              {t('fittings.header.menu')}
              <Expanded aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
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
          </DropdownMenuContent>
        </DropdownMenu>
        {actions}
      </div>
    </div>
  );
}
