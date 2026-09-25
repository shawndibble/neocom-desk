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
import type { Fitting } from '@/engine/fittings/types';
import type { LibraryTab } from './FittingLibrary';

interface FittingHeaderProps {
  fitting: Fitting;
  hullName: string;
  /** In-game Fittings need a Character. */
  hasCharacter: boolean;
  onLibrary: (tab: LibraryTab) => void;
  /** View toggle, Export, Save — the open Fitting's own controls, right-aligned. */
  actions: ReactNode;
  /** What its numbers are worked out under (implants, missing skills), on a row of its own. */
  context?: ReactNode;
}

/**
 * The open Fitting's header (scope decision `20260924-215855`): a Fittings
 * menu for everything that opens a different Fitting (new from a hull,
 * Import, My Fittings, In-game) — which used to be panels stacked above the
 * editor — then what this Fitting is, then its own controls.
 */
export function FittingHeader({
  fitting,
  hullName,
  hasCharacter,
  onLibrary,
  actions,
  context,
}: FittingHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>{t('fittings.header.menu')}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
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
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <TypeIcon typeId={fitting.shipTypeId} size={64} width={36} height={36} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{fitting.name}</h1>
            {/* A Fitting started from a bare hull is named after it; don't say it twice. */}
            {hullName !== fitting.name && (
              <p className="truncate text-xs text-text-dim">{hullName}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {context && <div className="flex flex-wrap items-start gap-x-4 gap-y-2">{context}</div>}
    </div>
  );
}
