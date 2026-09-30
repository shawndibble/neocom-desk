import { useCorpAccess } from './useCorpAccess';
import { useActiveCorporationId } from './owner';

/**
 * Whether the Corp section's nav entry shows: Corp Access `ready` *and* the
 * corporation known. One gate for the rail, the More sheet and the command
 * palette (#2318), so none of them can offer `/corp` while another hides it.
 *
 * Hidden, never locked, in every other case — including `unknown`, which
 * reads as hidden on purpose: a nav item that flickers into existence
 * mid-load is worse than one that appears a beat late (CONTEXT.md round 35).
 * The route itself takes the opposite view of `unknown` and waits, so a
 * deep-linked Director is not bounced (`routes/Corp.tsx`).
 *
 * The corporation id is part of the gate rather than an extra
 * (`useActiveCorporationId`, `owner.ts`): it is written by the public-info
 * read, so on a cold device it is simply absent, and an entry into a section
 * with no corporation behind it must not be on screen yet. It is self-healing
 * — the first visit to `/corp` learns and records the id, and that read is a
 * live query.
 */
export function useCorpNavVisible(): boolean {
  const { state } = useCorpAccess();
  const corporationId = useActiveCorporationId();
  return state === 'ready' && corporationId !== null;
}
