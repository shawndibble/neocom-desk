/**
 * A widget table row's first cell when the row is a campaign turn-in (issue
 * #6709): the cell opens `TurnInDetail` for the item, the same popover every
 * other surface opens, not the widget-row modal (DESIGN §6c "Widget rows").
 * The whole row is the target, as on every other opening row. Behind `lazy()`
 * in `TableBody`, so the popover's reads load only with a turn-in row.
 */
import { forwardRef, type ComponentProps } from 'react';
import { TurnInDetail } from '@/features/campaigns/TurnInDetail';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import { cx } from '@/lib/cx';
import type { TurnInRowModel } from './data/types';

/** The row-wide opener, the same look as a row that opens its modal. */
const RowOpener = forwardRef<HTMLButtonElement, ComponentProps<'button'>>(function RowOpener(
  { className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={entityLinkClassName(
        cx(
          'min-w-0 truncate text-left outline-none after:absolute after:inset-0 after:content-[""]',
          'focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent',
          className
        )
      )}
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
