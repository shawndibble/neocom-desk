import { cx } from '@/lib/cx';

/**
 * The class string of a clickable entity name — a character, corporation,
 * alliance, skill, item or solar system (DESIGN.md §6c "Entities"): accent
 * text at rest, underlined on hover and focus. The underline is always laid
 * out but its decoration is transparent at rest, so the name never reflows
 * and the cue arrives on hover/focus rather than carrying a solid underline,
 * which §6c reserves for a link inside a sentence (`inlineLinkClassName`).
 *
 * A class helper rather than a component, like `textActionClassName`: the one
 * recipe lands on a `Link`, an `<a>` and a `<button>` alike. `extra` carries
 * the per-site layout (`truncate`, `min-w-0`, `flex-1`); there is
 * deliberately no variant prop.
 */
export function entityLinkClassName(extra = ''): string {
  return cx(
    'rounded-xs text-accent underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:text-accent/75',
    extra
  );
}
