/**
 * Which of the five Widget States a widget is in.
 *
 * Precedence, highest first:
 * 1. needsPermission: the grant is missing, so nothing else can be true,
 *    unless a saved copy of the data exists (`hasStaleData`): then the data
 *    wins and `resolveWidget` asks for a small sign-in note beside it, so a
 *    lapsed grant never hides what is already on this device.
 * 2. loading: only while there is nothing to show yet (a refresh over data
 *    keeps showing the data). Also what "not read yet" means.
 * 3. failed: the read errored. Last good data, if any, is shown dimmed.
 * 4. empty: the read worked and found nothing.
 * 5. ok.
 */
export type WidgetState = 'loading' | 'needsPermission' | 'failed' | 'empty' | 'ok';

export interface WidgetStateInput {
  loading: boolean;
  needsPermission: boolean;
  error: boolean;
  hasData: boolean;
  isEmpty: boolean;
  /**
   * The grant lapsed (`needsPermission`) but a real saved copy of the payload
   * exists to show. Opt-in per kind: only a builder that has checked its saved
   * data actually holds the figures sets it, so a kind that would render a
   * blank "—" keeps the full prompt.
   */
  hasStaleData?: boolean;
}

export function resolveWidgetState(i: WidgetStateInput): WidgetState {
  if (i.needsPermission && !i.hasStaleData) return 'needsPermission';
  if (!i.hasData && (i.loading || !i.error)) return 'loading';
  if (i.error) return 'failed';
  if (i.isEmpty) return 'empty';
  return 'ok';
}

export function resolveWidget(i: WidgetStateInput): {
  state: WidgetState;
  showLastGood: boolean;
  /** Show the small "sign in again" note beside the data (a lapsed grant over saved data). */
  reauthNote: boolean;
} {
  const state = resolveWidgetState(i);
  return {
    state,
    showLastGood: state === 'failed' && i.hasData,
    reauthNote: i.needsPermission && !!i.hasStaleData && state !== 'loading',
  };
}
