import type { ComponentProps } from 'react';
import { TypeIcon } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useOreFormTypeId } from './oreForm';

export function OreIcon({ typeId, ...rest }: ComponentProps<typeof TypeIcon>) {
  const shownAs = useOreFormTypeId();
  return <TypeIcon {...rest} typeId={shownAs(typeId)} />;
}

export function OreLink({ typeId, ...rest }: ComponentProps<typeof MarketItemLink>) {
  const shownAs = useOreFormTypeId();
  return <MarketItemLink {...rest} typeId={shownAs(typeId)} />;
}
