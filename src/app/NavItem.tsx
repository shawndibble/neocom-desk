import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGrantedScopes } from './useGrantedScopes';
import { warmRoute } from './routeWarm';
import { preloadRouteChunk } from './routeChunks';
import { NAV_ICON_BY_PATH } from './navIcons';
import { navPlaceFor } from './navRail';
import { toggleHiddenNav } from './navPreferences';
import type { AppRoutePath } from './routeScopes';

const NAV_LINK = `flex min-h-11 min-w-0 items-center gap-2 rounded-xs border border-transparent px-2 py-1.5 text-xs font-semibold tracking-widest uppercase md:min-h-0 ${interactiveClassName} ${focusRingInsetClassName}`;
const NAV_ACTIVE = 'border-line-bright bg-panel-2 text-accent';
const NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text active:bg-panel';

function navClass({ isActive }: { isActive: boolean }): string {
  return `${NAV_LINK} ${isActive ? NAV_ACTIVE : NAV_IDLE}`;
}

export const MOBILE_NAV_ITEM = `relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 border-transparent px-1 py-1.5 text-[0.6875rem] font-semibold uppercase ${interactiveClassName} ${focusRingInsetClassName}`;
export const MOBILE_NAV_ACTIVE = 'border-accent bg-panel-2 text-accent';
export const MOBILE_NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text active:bg-panel';

function mobileNavClass({ isActive }: { isActive: boolean }): string {
  return `${MOBILE_NAV_ITEM} ${isActive ? MOBILE_NAV_ACTIVE : MOBILE_NAV_IDLE}`;
}

const TILE = `relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xs border px-1 py-2 text-center text-[0.6875rem] font-semibold tracking-wide uppercase ${interactiveClassName} ${focusRingInsetClassName}`;
const TILE_ACTIVE = 'border-accent-dim bg-panel-2 text-accent';
const TILE_IDLE =
  'border-line bg-panel-2/60 text-text-dim hover:bg-panel-2 hover:text-text active:bg-panel';

function tileClass({ isActive }: { isActive: boolean }): string {
  return `${TILE} ${isActive ? TILE_ACTIVE : TILE_IDLE}`;
}

const BAR = `relative flex min-h-11 min-w-0 items-center gap-2 rounded-xs border px-3 text-[0.6875rem] font-semibold tracking-wide uppercase ${interactiveClassName} ${focusRingInsetClassName}`;

function barClass({ isActive }: { isActive: boolean }): string {
  return `${BAR} ${isActive ? TILE_ACTIVE : TILE_IDLE}`;
}

export interface NavItemProps {
  to: AppRoutePath;
  label: string;
  locked: boolean;
  badge?: number;
  badgeLabelKey?: string;
  attention?: boolean;
  presentation?: 'rail' | 'tab' | 'tile' | 'bar';
  className?: string;
  onClick?: () => void;
}

export function NavItem({
  to,
  label,
  locked,
  badge,
  badgeLabelKey,
  attention = false,
  presentation = 'rail',
  className,
  onClick,
}: NavItemProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const location = useLocation();
  const originState =
    to === '/characters' ? { from: location.pathname + location.search } : undefined;
  const warm = () => {
    preloadRouteChunk(to);
    void warmRoute(to, activeCharacterId, granted);
  };
  const tab = presentation === 'tab';
  const tile = presentation === 'tile';
  const bar = presentation === 'bar';
  const counted = badge !== undefined && badge > 0;
  const Glyph = NAV_ICON_BY_PATH[to];
  const linkClass = tab ? mobileNavClass : tile ? tileClass : bar ? barClass : navClass;
  const isActive = navPlaceFor(location.pathname).pagePath === to;
  const link = (
    <Link
      to={to}
      state={originState}
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      onMouseEnter={warm}
      onFocus={warm}
      onPointerDown={warm}
      className={cx(linkClass({ isActive }), className)}
      data-locked={locked ? 'true' : undefined}
      aria-label={
        counted
          ? t(badgeLabelKey ?? 'nav.alertsWithCount', { count: badge })
          : attention
            ? t('nav.needsAttention', { label })
            : undefined
      }
    >
      {Glyph && (
        <Glyph
          aria-hidden="true"
          className="shrink-0"
          size={tile ? Icon.ICON_SIZE.lg : bar ? Icon.ICON_SIZE.md : Icon.ICON_SIZE.sm}
        />
      )}
      <span className="min-w-0 truncate">{label}</span>
      {attention && (
        <span
          aria-hidden="true"
          data-attention-dot
          className={cx(
            'size-1.5 shrink-0 rounded-full bg-accent',
            tab || tile ? 'absolute top-1.5 left-1/2 ml-3' : '-ml-1'
          )}
        />
      )}
      {counted && (
        <span
          aria-hidden="true"
          className={cx(
            'shrink-0 rounded-xs bg-panel-2 tabular-nums text-text-dim',
            tab || tile
              ? 'absolute top-1 left-1/2 ml-2 px-1'
              : 'ml-auto px-1.5 text-[0.6875rem] font-medium'
          )}
        >
          {badge}
        </span>
      )}
      {locked && (
        <span
          aria-hidden="true"
          className={cx(
            'size-1.5 shrink-0 rounded-full bg-warning',
            tab || tile ? 'absolute top-1.5 right-1.5' : 'ml-auto'
          )}
        />
      )}
    </Link>
  );
  return locked ? <Tooltip content={t('reauth.navLocked')}>{link}</Tooltip> : link;
}

export function NavHideToggle({
  path,
  label,
  hidden,
  className,
}: {
  path: string;
  label: string;
  hidden: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <IconButton
      variant="plain"
      size="sm"
      className={className}
      icon={hidden ? <Icon.NavHidden /> : <Icon.NavShown />}
      label={t('nav.showInNav', { page: label })}
      pressed={!hidden}
      onClick={() => toggleHiddenNav(path)}
    />
  );
}
