import { ContinueSessionCard } from '@/features/miningTax/ContinueSessionCard';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import type { SessionContinuation as Continuation } from '@/features/miningTax/sessionContinuation';

interface ContinueSessionCardsProps {
  continuations: Continuation[];
  autoContinue: boolean;
  autoSkip: ReadonlySet<string>;
  typeNames: ReadonlyMap<number, string>;
  busy: boolean;
  systemName: (dr: DisplayRow) => string;
  payeeName: (payeeId: string | undefined) => string;
  onContinue: (c: Continuation) => void;
  onChooseOther: (dr: DisplayRow) => void;
  onKeepSeparate: (c: Continuation) => void;
  onAutoContinueChange: (next: boolean) => void;
}

/** The offers to continue a previous session: all of them, or only the ones auto-continue skipped. */
export function ContinueSessionCards({
  continuations,
  autoContinue,
  autoSkip,
  typeNames,
  busy,
  systemName,
  payeeName,
  onContinue,
  onChooseOther,
  onKeepSeparate,
  onAutoContinueChange,
}: ContinueSessionCardsProps) {
  const shown = continuations.filter((c) => !autoContinue || autoSkip.has(c.next.key));
  if (shown.length === 0) return null;
  return (
    <div className="space-y-2">
      {shown.map((c) => (
        <ContinueSessionCard
          key={c.next.key}
          continuation={c}
          systemName={systemName(c.next)}
          payeeName={payeeName(c.previous.payeeId)}
          typeNames={typeNames}
          busy={busy}
          autoContinue={autoContinue}
          onContinue={() => onContinue(c)}
          onChooseOther={() => onChooseOther(c.next)}
          onKeepSeparate={() => onKeepSeparate(c)}
          onAutoContinueChange={onAutoContinueChange}
        />
      ))}
    </div>
  );
}
