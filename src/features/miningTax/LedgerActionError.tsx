/** Why a Mining Tax ledger action wrote nothing — `useLedgerAction`'s `error`, rendered the same in every dialog. */
export function LedgerActionError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-danger">
      {error}
    </p>
  );
}
