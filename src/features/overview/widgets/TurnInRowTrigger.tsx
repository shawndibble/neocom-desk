import { forwardRef, type ComponentProps } from 'react';
import { TurnInDetail } from '@/features/campaigns/TurnInDetail';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import { cx } from '@/lib/cx';
import type { TurnInRowModel } from './data/types';
import { ROW_TARGET_CLASS } from './rowTarget';

const RowOpener = forwardRef<HTMLButtonElement, ComponentProps<'button'>>(function RowOpener(
  { className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={entityLinkClassName(cx(ROW_TARGET_CLASS, 'text-left', className))}
    />
  );
});

export default function TurnInRowTrigger({
  turnIn,
  text,
}: {
  turnIn: TurnInRowModel;
  text: string;
}) {
  return (
    <RowTappableContext.Provider value>
      <TurnInDetail
        name={turnIn.name}
        offer={turnIn.offer}
        characterId={turnIn.characterId}
        characterName={turnIn.characterName}
        surfaceLine={turnIn.surfaceLine}
        trigger={<RowOpener>{text}</RowOpener>}
      />
    </RowTappableContext.Provider>
  );
}
