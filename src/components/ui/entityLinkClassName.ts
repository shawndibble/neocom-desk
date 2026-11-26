import { cx } from '@/lib/cx';

export function entityLinkClassName(extra = ''): string {
  return cx(
    'rounded-xs text-accent underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:text-accent/75',
    extra
  );
}
