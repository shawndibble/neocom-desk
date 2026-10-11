/**
 * Which of the five Widget States a widget is in.
 *
 * Precedence, highest first:
 * 1. needsPermission: the grant is missing, so nothing else can be true.
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
}

export function resolveWidgetState(i: WidgetStateInput): WidgetState {
  if (i.needsPermission) return 'needsPermission';
  if (!i.hasData && (i.loading || !i.error)) return 'loading';
  if (i.error) return 'failed';
  if (i.isEmpty) return 'empty';
  return 'ok';
}

export function resolveWidget(i: WidgetStateInput): { state: WidgetState; showLastGood: boolean } {
  const state = resolveWidgetState(i);
  return { state, showLastGood: state === 'failed' && i.hasData };
}
