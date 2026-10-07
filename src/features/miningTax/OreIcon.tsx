import type { ComponentProps } from 'react';
import { TypeIcon } from '@/components/ui';
import { useOreFormTypeId } from './oreForm';

/** `TypeIcon` for a mined ore, drawn as the type the Ore Form setting shows it as. */
export function OreIcon({ typeId, ...rest }: ComponentProps<typeof TypeIcon>) {
  const shownAs = useOreFormTypeId();
  return <TypeIcon {...rest} typeId={shownAs(typeId)} />;
}
