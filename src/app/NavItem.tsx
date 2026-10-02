import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGrantedScopes } from './useGrantedScopes';
import { warmRoute } from './routeWarm';
import { preloadRouteChunk } from './routeChunks';
import { NAV_ICON_BY_PATH } from './navIcons';
import { toggleHiddenNav } from './navPreferences';
import type { AppRoutePath } from './routeScopes';

// `min-h-11 md:min-h-0`: the rail row is mouse-operated with room to spare, so
// only a phone-width rendering ever gets the 44px touch target.
const NAV_LINK =
  'flex min-h-11 min-w-0 items-center gap-2 rounded-xs border border-transparent px-2 py-1.5 text-xs font-semibold tracking-widest uppercase transition-colors md:min-h-0';
const NAV_ACTIVE = 'border-line-bright bg-panel-2 text-accent';
const NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text';

function navClass({ isActive }: { isActive: boolean }): string {
  return `${NAV_LINK} ${isActive ? NAV_ACTIVE : NAV_IDLE}`;
}

// Distinct from NAV_LINK: the bottom tab bar is a fixed five-way split of a
// viewport that can be as narrow as ~320px. `flex-1 min-w-0` forces every
// tab — including "More" — to always get an equal, bounded share of the
// width, so a long label truncates instead of pushing later tabs off-screen.
// `min-h-11` (44px) meets the mobile touch-target minimum; the icon sits above
// the label.
export const MOBILE_NAV_ITEM =
  'relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 border-transparent px-1 py-1.5 text-[0.625rem] font-semibold uppercase transition-colors';
export const MOBILE_NAV_ACTIVE = 'border-accent bg-panel-2 text-accent';
export const MOBILE_NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text';

function mobileNavClass({ isActive }: { isActive: boolean }): string {
  return `${MOBILE_NAV_ITEM} ${isActive ? MOBILE_NAV_ACTIVE : MOBILE_NAV_IDLE}`;
}

// The More sheet's tiles: an icon over a short label, four to a row.
const TILE =
  'relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xs border px-1 py-2 text-center text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors';
const TILE_ACTIVE = 'border-accent-dim bg-panel-2 text-accent';
const TILE_IDLE = 'border-line bg-panel-2/60 text-text-dim hover:bg-panel-2 hover:text-text';

function tileClass({ isActive }: { isActive: boolean }): string {
  return `${TILE} ${isActive ? TILE_ACTIVE : TILE_IDLE}`;
}

export interface NavItemProps {
  to: AppRoutePath;
  label: string;
  locked: boolean;
  /**
   * What is waiting at this destination, rendered beside the label. Zero and
   * `undefined` both render nothing: a badge reading "0" is a badge you stop
   * looking at. It is a number, not a dot, because "some" and "seventy" are
   * different situations and an accent tint conveys neither (DESIGN.md §7) —
   * and it rides in the link's accessible name rather than as a bare numeral a
   * screen reader would read out as "Alerts 12".
   */
  badge?: number;
  /**
   * `rail` (default) is the desktop rail's full-width row; `tab` the phone tab
   * bar's equal share of the viewport; `tile` a More-sheet tile. One component
   * for all three so the lock marker, the badge and the accessible name cannot
   * say different things in the places a destination appears.
   */
  presentation?: 'rail' | 'tab' | 'tile';
  className?: string;
  onClick?: () => void;
}

/**
 * A nav destination, wherever it appears. A page path carries its icon
 * (`navIcons.ts`).
 *
 * A `locked` one is marked, never disabled: the link still navigates and the
 * route's `ScopeGate` explains why, and disabling it would leave no way to
 * reach the explanation.
 */
export function NavItem({
  to,
  label,
  locked,
  badge,
  presentation = 'rail',
  className,
  onClick,
}: NavItemProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const location = useLocation();
  // Only `/characters` carries an origin — it is the one destination a
  // pilot needs to come back *from* (#1764); every other nav item is a
  // destination in its own right.
  const originState = to === '/characters' ? { from: location.pathname } : undefined;
  /*
   * Compose this route's snapshot while the pointer is still travelling to the
   * link (`routeWarm.ts`). `focus` covers the keyboard, where tabbing to a link
   * is the same declaration of intent. Both are fire-and-forget: `warmRoute`
   * never rejects, and it no-ops for a route that is already warm, already
   * warming, short of a grant, or simply has no warmer.
   *
   * The route's code chunk (`routeChunks.ts`) is preloaded on the same
   * intent, ungated: fetching JavaScript spends no ESI request.
   *
   * A touch device fires neither event until the tap itself, so on the phone's
   * surfaces this is inert rather than wasted.
   */
  const warm = () => {
    preloadRouteChunk(to);
    void warmRoute(to, activeCharacterId, granted);
  };
  const tab = presentation === 'tab';
  const tile = presentation === 'tile';
  const counted = badge !== undefined && badge > 0;
  const Glyph = NAV_ICON_BY_PATH[to];
  const linkClass = tab ? mobileNavClass : tile ? tileClass : navClass;
  // The lock marker rides on `title`, and the count on `aria-label`: a second
  // string inside the link would rewrite its accessible name from "Assets" to
  // "Assets, needs a new login", which is not what the link is called.
  return (
    <NavLink
      to={to}
      state={originState}
      onClick={onClick}
      onMouseEnter={warm}
      onFocus={warm}
      className={(state) => cx(linkClass(state), className)}
      title={locked ? t('reauth.navLocked') : undefined}
      aria-label={counted ? t('nav.alertsWithCount', { count: badge }) : undefined}
    >
      {Glyph && (
        <Glyph
          aria-hidden="true"
          className="shrink-0"
          size={tile ? Icon.ICON_SIZE.lg : Icon.ICON_SIZE.sm}
        />
      )}
      <span className="min-w-0 truncate">{label}</span>
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
    </NavLink>
  );
}

/**
 * The hide editor's toggle for one page or view, in the rail and the More
 * sheet: one fixed name, with `aria-pressed` saying whether it is shown.
 */
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
