/**
 * Opens the shared Public Info Modal for a contract's issuer — always a
 * character id per ESI's contracts schema, so no `kind` branching like
 * Contacts needs (CONTEXT.md round 49). Shared by the Contracts table and
 * its detail modal so the two button styles never drift.
 */
import { usePublicInfoModal } from '@/stores/publicInfoModal';

interface IssuerLinkProps {
  issuerId: number;
  name: string;
  className?: string;
}

export function IssuerLink({ issuerId, name, className = '' }: IssuerLinkProps) {
  const { open } = usePublicInfoModal();
  return (
    <button
      type="button"
      onClick={() => open('character', issuerId)}
      className={`text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {name}
    </button>
  );
}
