import { useState, type ReactNode } from 'react';
import { Toast } from '@/components/ui/Toast';
import { NOTICE_MS } from '@/components/ui/useTimedToast';

export interface Outcome {
  tone: 'status' | 'alert';
  text: ReactNode;
}

export function OutcomeNote({
  outcome,
  durationMs = NOTICE_MS,
  as: Tag = 'span',
  className = '',
}: {
  outcome: Outcome | null;
  durationMs?: number;
  as?: 'span' | 'p';
  className?: string;
}) {
  const [closed, setClosed] = useState<Outcome | null>(null);
  if (!outcome) return null;
  if (outcome.tone === 'status') {
    return closed === outcome ? null : (
      <Toast
        message={outcome.text}
        instance={outcome}
        durationMs={durationMs}
        onClose={() => setClosed(outcome)}
      />
    );
  }
  return (
    <Tag role="alert" className={`text-xs text-danger ${className}`.trimEnd()}>
      {outcome.text}
    </Tag>
  );
}
