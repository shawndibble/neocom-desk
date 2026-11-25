/**
 * What a send-to-the-EVE-client action (Set destination, Open in EVE, Message,
 * Set waypoints) said back. A success is a short-lived `Toast`, like "Copied"
 * on the appraisal page, rather than a line that stays beside the button and
 * shifts the layout. A failure stays inline as an alert: it can carry a Grant
 * link and must not vanish before it is read.
 */
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
  /** How long a success stays up; a long sentence needs longer than a confirmation. */
  durationMs?: number;
  /** The element an inline failure is drawn in. */
  as?: 'span' | 'p';
  /** Layout classes for the inline failure. */
  className?: string;
}) {
  // The outcome object is the toast's identity: a new send is a new toast, and
  // closing one hides only that one.
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
