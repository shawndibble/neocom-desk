import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
  inline?: boolean;
  resetKey?: string;
  fallback?: ReactNode;
}

interface State {
  failed: boolean;
}

function ErrorScreen({ inline }: { inline: boolean }) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const wasOffline = useRef(offline);
  useEffect(() => {
    const goOffline = () => {
      wasOffline.current = true;
      setOffline(true);
    };
    const comeOnline = () => {
      setOffline(false);
      if (wasOffline.current) window.location.reload();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', comeOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', comeOnline);
    };
  }, []);
  const Wrapper = inline ? 'section' : 'main';
  return (
    <Wrapper
      className={`flex flex-col items-center justify-center gap-3 text-center text-text ${
        inline ? 'p-6 py-16' : 'safe-inset min-h-dvh [--safe-x:1.5rem] [--safe-y:1.5rem] bg-bg'
      }`}
    >
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-semibold tracking-widest uppercase focus:outline-none"
      >
        {t('error.title', { defaultValue: 'Something went wrong' })}
      </h1>
      <p className="max-w-prose text-xs text-text-dim">
        {offline
          ? t('error.offlineHint', {
              defaultValue:
                "This page can't load while you're offline. It will try again when your connection returns. Your Skill Plans and Build Plans are stored locally and are not affected.",
            })
          : t('error.hint', {
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
    if (!this.state.failed) return this.props.children;
    return this.props.fallback ?? <ErrorScreen inline={this.props.inline ?? false} />;
  }
}
