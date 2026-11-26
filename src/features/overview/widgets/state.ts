export type WidgetState = 'loading' | 'needsPermission' | 'failed' | 'empty' | 'ok';

export interface WidgetStateInput {
  loading: boolean;
  needsPermission: boolean;
  error: boolean;
  hasData: boolean;
  isEmpty: boolean;
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
  reauthNote: boolean;
} {
  const state = resolveWidgetState(i);
  return {
    state,
    showLastGood: state === 'failed' && i.hasData,
    reauthNote: i.needsPermission && !!i.hasStaleData && state !== 'loading',
  };
}
