import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { MaterialErrand } from './materialErrands';

/**
 * Each section's colour, carried by its heading. Never the only cue
 * (docs/DESIGN.md §7): every heading also names its section in words and,
 * where one exists, carries the errand's own glyph.
 */
export const ERRAND_TONE: Record<MaterialErrand, string> = {
  toBuy: 'text-text',
  building: 'text-success',
  blueprint: 'text-blueprint-copy',
  have: 'text-text-dim',
};

export const ERRAND_GLYPH: Record<MaterialErrand, typeof Icon.Build | null> = {
  toBuy: Icon.Buy,
  building: Icon.Build,
  blueprint: Icon.Blueprint,
  have: null,
};

export const ERRAND_LABEL_KEY: Record<MaterialErrand, string> = {
  toBuy: 'industry.errands.toBuy',
  building: 'industry.errands.building',
  blueprint: 'industry.errands.blueprint',
  have: 'industry.errands.have',
};

/**
 * Editable-in-place value (§6c): faint pencil at rest, field box on hover/focus.
 * The 44px touch tier is the button's own height below `md` (§3), never an
 * overhanging `::after`, which reached into the row's next target.
 */
export const editableValueClassName = cx(
  'inline-flex min-h-11 items-center gap-1 rounded-xs border border-transparent px-1 hover:border-line-bright hover:bg-panel-2 md:min-h-0',
  interactiveClassName,
  focusRingClassName
);
export const editPencilClassName = 'text-text-faint';

type LinkTone = 'accent' | 'build' | 'blueprint' | 'quiet';

/**
 * A row's text action — Recipe, Build instead, Buy instead, Change tier. Text
 * rather than a bare glyph: the hammer/cart button this replaces said what a
 * click did only on hover, and needed a reserved slot beside every name to
 * line the names up, which read as an indent on every row without one.
 */
export function linkClassName(tone: LinkTone): string {
  return cx(
    'inline-flex min-h-11 items-center gap-1 rounded-xs text-[0.6875rem] font-semibold whitespace-nowrap underline underline-offset-2 md:min-h-0',
    interactiveClassName,
    focusRingClassName,
    tone === 'accent' && 'text-accent decoration-accent-dim',
    tone === 'build' && 'text-success decoration-success/50',
    tone === 'blueprint' && 'text-blueprint-copy decoration-blueprint-copy/50',
    tone === 'quiet' && 'text-text-dim decoration-line-bright hover:text-text'
  );
}
