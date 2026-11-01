import { focusRingInsetClassName } from '@/components/ui/controlStyles';

/**
 * A Refine figure that opens its breakdown: the number itself, dashed
 * underlined (§6c: dashed opens something, dotted explains). It keeps its
 * colour, so a figure that won its comparison stays green.
 */
export const refineOpenerClassName = `cursor-pointer rounded-xs underline decoration-dashed decoration-current/70 underline-offset-2 hover:text-accent ${focusRingInsetClassName}`;
