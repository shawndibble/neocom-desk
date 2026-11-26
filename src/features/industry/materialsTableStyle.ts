import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { MaterialErrand } from './materialErrands';

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

type LinkTone = 'accent' | 'build' | 'blueprint' | 'quiet';

export function linkClassName(tone: LinkTone): string {
  return cx(
    'inline-flex min-h-9 items-center gap-1 rounded-xs text-[0.6875rem] font-semibold whitespace-nowrap underline underline-offset-2 md:min-h-0',
    interactiveClassName,
    focusRingClassName,
    tone === 'accent' && 'text-accent decoration-accent-dim',
    tone === 'build' && 'text-success decoration-success/50',
    tone === 'blueprint' && 'text-blueprint-copy decoration-blueprint-copy/50',
    tone === 'quiet' && 'text-text-dim decoration-line-bright hover:text-text'
  );
}
