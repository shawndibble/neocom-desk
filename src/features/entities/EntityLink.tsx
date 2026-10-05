/**
 * Clickable entity names (DESIGN.md §6c "Entities"). Each is a real
 * react-router `<Link>` with its own URL, so a plain click navigates in-app
 * and middle-click / Ctrl+click open a new tab with no extra code:
 *
 * - `CharacterLink`, `CorporationLink`, `AllianceLink`, `SkillLink` point at
 *   the *current* page plus `?info=<kind>-<id>`; `EntityInfoRoute` opens the
 *   Show Info / Skill modal from that param.
 * - `SystemLink` goes to Route Safety with the system as the destination.
 *
 * Every one forwards its ref and spreads extra anchor props, so a `Tooltip`
 * `asChild` or `RowActionsMenu` trigger can wrap it. Layout (`truncate`,
 * `flex-1`, a text colour for a quiet column) comes in through `className`.
 */
import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { PlanEntry } from '@/engine/types';
import { entityInfoHref, parseEntityInfo, type EntityInfoTarget } from '@/lib/entityInfo';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { routeToHref } from '@/features/travel/routeSafetyLink';
import { ENTITY_INFO_PUSHED_STATE } from './entityInfoState';

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'id'>;

interface EntityLinkProps extends AnchorProps {
  children: ReactNode;
  className?: string;
}

function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  const target = event.currentTarget.target;
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    (!target || target === '_self') &&
    !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
  );
}

const InfoLink = forwardRef<HTMLAnchorElement, EntityLinkProps & { entity: EntityInfoTarget }>(
  function InfoLink({ entity, className, children, ...rest }, ref) {
    const location = useLocation();
    // From inside an open modal (a drill-down) the entry is replaced, not stacked.
    const drillDown = parseEntityInfo(location.search) !== null;
    return (
      <Link
        {...rest}
        ref={ref}
        to={entityInfoHref(location, entity)}
        replace={drillDown}
        state={drillDown ? location.state : ENTITY_INFO_PUSHED_STATE}
        className={entityLinkClassName(className)}
      >
        {children}
      </Link>
    );
  }
);

export const CharacterLink = forwardRef<HTMLAnchorElement, EntityLinkProps & { id: number }>(
  function CharacterLink({ id, ...rest }, ref) {
    return <InfoLink {...rest} ref={ref} entity={{ kind: 'character', id }} />;
  }
);

export const CorporationLink = forwardRef<HTMLAnchorElement, EntityLinkProps & { id: number }>(
  function CorporationLink({ id, ...rest }, ref) {
    return <InfoLink {...rest} ref={ref} entity={{ kind: 'corporation', id }} />;
  }
);

export const AllianceLink = forwardRef<HTMLAnchorElement, EntityLinkProps & { id: number }>(
  function AllianceLink({ id, ...rest }, ref) {
    return <InfoLink {...rest} ref={ref} entity={{ kind: 'alliance', id }} />;
  }
);

export const SkillLink = forwardRef<
  HTMLAnchorElement,
  EntityLinkProps & {
    typeId: number;
    /** The open Skill Plan's entries, so prerequisites it already trains read "Planned". */
    planEntries?: readonly PlanEntry[];
  }
>(function SkillLink({ typeId, planEntries, onClick, ...rest }, ref) {
  const stage = useSkillDetailModalStore((state) => state.stage);
  return (
    <InfoLink
      {...rest}
      ref={ref}
      entity={{ kind: 'skill', id: typeId }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        // Only the click react-router handles in-app opens the modal here; a
        // Ctrl/middle click opens a new tab and must not leave entries staged.
        if (isPlainPrimaryClick(event)) stage(typeId, planEntries);
      }}
    />
  );
});

export const SystemLink = forwardRef<HTMLAnchorElement, EntityLinkProps & { systemId: number }>(
  function SystemLink({ systemId, className, children, ...rest }, ref) {
    return (
      <Link
        {...rest}
        ref={ref}
        to={routeToHref(systemId)}
        className={entityLinkClassName(className)}
      >
        {children}
      </Link>
    );
  }
);
