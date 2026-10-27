import type { ComponentProps } from 'react';
import { TypeIcon } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useOreFormTypeId } from './oreForm';

/** `TypeIcon` for a mined ore, drawn as the type the Ore Form setting shows it as. */
export function OreIcon({ typeId, ...rest }: ComponentProps<typeof TypeIcon>) {
  const shownAs = useOreFormTypeId();
  return <TypeIcon {...rest} typeId={shownAs(typeId)} />;
}

/** `MarketItemLink` for a mined ore, pointing at the type the Ore Form setting shows it as. */
export function OreLink({ typeId, ...rest }: ComponentProps<typeof MarketItemLink>) {
  const shownAs = useOreFormTypeId();
  return <MarketItemLink {...rest} typeId={shownAs(typeId)} />;
}
