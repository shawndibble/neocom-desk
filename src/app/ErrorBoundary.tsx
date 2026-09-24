import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
  /**
   * Renders the error inside the app shell rather than as a full page — for
   * the boundary around `Layout`'s outlet, where the rail must survive a page
   * that failed (a render throw, or a route chunk that would not load).
   */
  inline?: boolean;
  /** A change clears the error: navigating away from a failed page recovers. */
  resetKey?: string;
}

interface State {
  failed: boolean;
}

/**
 * `defaultValue` throughout: this renders when something has already gone
 * wrong, so a missing catalog must not turn a recoverable error into a blank
 * page.
 */
function ErrorScreen({ inline }: { inline: boolean }) {
  const { t } = useTranslation();
  // Inside the shell the page already sits in `Layout`'s `<main>`.
  const Wrapper = inline ? 'section' : 'main';
  return (
    <Wrapper
      className={`flex flex-col items-center justify-center gap-3 p-6 text-center text-text ${
        inline ? 'py-16' : 'min-h-screen bg-bg'
      }`}
    >
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
    </Wrapper>
  );
}

/**
 * Last resort so a render throw shows something recoverable instead of a blank
 * page. `useLiveQuery` rethrows a Dexie failure during render and every feature
 * route sits behind one, so a broken IndexedDB would otherwise unmount the app.
 *
 * Never renders the error text: a message can carry data the user would not
 * expect on screen. It is reported rather than shown — React 19 routes
 * anything this boundary catches to the `onCaughtError` root hook, which
 * `main.tsx` wires to Sentry. Capturing here as well would file every one of
 * those errors twice.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('Unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? (
      <ErrorScreen inline={this.props.inline ?? false} />
    ) : (
      this.props.children
    );
  }
}
