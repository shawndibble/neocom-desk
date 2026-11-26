import { lazy, Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import { Spinner } from '@/components/ui';

export interface MailBodyEditorProps {
  value: string;
  onChange: (value: string) => void;
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
  counter?: ReactNode;
  className?: string;
}

const RichMailBodyEditor = lazy(() => guarded(() => import('./mailEditor/RichMailBodyEditor')));

export function MailBodyEditor(props: MailBodyEditorProps) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-busy
          className={`flex min-h-40 flex-1 items-center justify-center gap-2 text-xs text-text-dim ${props.className ?? ''}`}
        >
          <Spinner size="sm" /> {t('mail.format.loading')}
          {props.counter}
        </div>
      }
    >
      <RichMailBodyEditor {...props} />
    </Suspense>
  );
}
