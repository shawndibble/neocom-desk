import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { PlanEntry } from '@/engine/types';
import { entityInfoHref, parseEntityInfo, type EntityInfoTarget } from '@/lib/entityInfo';
import { useItemInfoModalStore } from '@/stores/itemInfoModal';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { routeToHref } from '@/features/route/routeSafetyLink';

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
    const drillDown = parseEntityInfo(location.search) !== null;
    return (
      <Link
        {...rest}
        ref={ref}
        to={entityInfoHref(location, entity)}
        replace={drillDown}
        state={drillDown ? location.state : undefined}
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

export const FactionLink = forwardRef<HTMLAnchorElement, EntityLinkProps & { id: number }>(
  function FactionLink({ id, ...rest }, ref) {
    return <InfoLink {...rest} ref={ref} entity={{ kind: 'faction', id }} />;
  }
);

export const SkillLink = forwardRef<
  HTMLAnchorElement,
  EntityLinkProps & {
    typeId: number;
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
        if (isPlainPrimaryClick(event)) stage(typeId, planEntries);
      }}
    />
  );
});

export const ItemInfoLink = forwardRef<
  HTMLAnchorElement,
  EntityLinkProps & {
    typeId: number;
    itemName?: string;
    itemId?: number;
  }
>(function ItemInfoLink({ typeId, itemName, itemId, onClick, ...rest }, ref) {
  const stage = useItemInfoModalStore((state) => state.stage);
  return (
    <InfoLink
      {...rest}
      ref={ref}
      entity={{ kind: 'type', id: typeId, itemId }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!isPlainPrimaryClick(event)) return;
        const name = itemName ?? (typeof rest.children === 'string' ? rest.children : undefined);
        stage(typeId, name);
      }}
    />
  );
});

export const PlaceLink = forwardRef<HTMLAnchorElement, EntityLinkProps & { id: number }>(
  function PlaceLink({ id, ...rest }, ref) {
    return <InfoLink {...rest} ref={ref} entity={{ kind: 'place', id }} />;
  }
);

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
