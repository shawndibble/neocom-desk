import type { ReactNode } from 'react';
import { AllianceLink, CharacterLink, CorporationLink } from '@/features/entities/EntityLink';

/**
 * A name in a report as an entity link (DESIGN.md §6c "Entities"): a character, corporation or
 * alliance opens its Show Info. Anything else the server could not place stays plain text.
 */
export function VettingEntity({
  id,
  category,
  className,
  children,
}: {
  id: number;
  category: 'character' | 'corporation' | 'alliance' | 'other';
  className?: string;
  children: ReactNode;
}) {
  if (category === 'character') {
    return (
      <CharacterLink id={id} className={className}>
        {children}
      </CharacterLink>
    );
  }
  if (category === 'corporation') {
    return (
      <CorporationLink id={id} className={className}>
        {children}
      </CorporationLink>
    );
  }
  if (category === 'alliance') {
    return (
      <AllianceLink id={id} className={className}>
        {children}
      </AllianceLink>
    );
  }
  return <span className={className}>{children}</span>;
}
