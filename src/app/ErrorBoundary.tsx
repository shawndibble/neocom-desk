import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * `defaultValue` throughout: this renders when something has already gone
 * wrong, so a missing catalog must not turn a recoverable error into a blank
 * page.
 */
function ErrorScreen() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center text-text">
      <h1 className="text-sm font-semibold tracking-widest uppercase">
        {t('error.title', { defaultValue: 'Something went wrong' })}
      </h1>
      <p className="max-w-prose text-xs text-text-dim">
        {t('error.hint', {
          defaultValue:
            'Reloading usually fixes this. Your Skill Plans and Build Plans are stored locally and are not affected.',
        })}
      </p>
      <Button size="sm" onClick={() => window.location.reload()}>
        {t('error.reload', { defaultValue: 'Reload' })}
      </Button>
    </main>
  );
}

/**
 * Last resort so a render throw shows something recoverable instead of a blank
 * page. `useLiveQuery` rethrows a Dexie failure during render and every feature
 * route sits behind one, so a broken IndexedDB would otherwise unmount the app.
 *
 * Never renders the error text: a message can carry data the user would not
 * expect on screen, and there is no sink to send it to (ADR 0001 — no backend).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('Unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? <ErrorScreen /> : this.props.children;
  }
}
