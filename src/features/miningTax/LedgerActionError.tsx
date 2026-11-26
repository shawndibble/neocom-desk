import { InlineError } from '@/components/ui/InlineError';
export function LedgerActionError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <InlineError>{error}</InlineError>;
}
