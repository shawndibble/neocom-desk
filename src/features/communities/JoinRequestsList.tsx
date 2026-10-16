import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callableErrorReason } from './callableError';
import { decideJoinRequest, type JoinRequest } from './communityStore';
import { NeedsConnection, Button } from '@/components/ui';

/**
 * The Characters waiting to be let in (a Community that approves new
 * Members), on the admin's Members tab: Accept or Decline each. A cap that
 * stops an accept (the Community is full, or the Character is already in 10)
 * is named, and the request stays.
 */
export function JoinRequestsList({
  requests,
  characterId,
  communityId,
  onDecided,
}: {
  requests: readonly JoinRequest[];
  characterId: number;
  communityId: string;
  /** Refetch the requests and the Member list. */
  onDecided: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ uid: string; message: string } | null>(null);

  async function decide(request: JoinRequest, accept: boolean) {
    setBusy(request.uid);
    setProblem(null);
    try {
      await decideJoinRequest(characterId, communityId, request.uid, accept);
      onDecided();
    } catch (err) {
      const reason = callableErrorReason(err);
      setProblem({
        uid: request.uid,
        message:
          reason === 'community-full'
            ? t('communities.requests.full')
            : reason === 'too-many-communities'
              ? t('communities.requests.tooMany')
              : t('communities.requests.failed'),
      });
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) return null;
  return (
    <section className="mb-3 space-y-1" aria-label={t('communities.requests.title')}>
      <h3 className="text-xs font-semibold">
        {t('communities.requests.heading', { count: requests.length })}
      </h3>
      <ul className="divide-y divide-line">
        {requests.map((request) => (
          <li key={request.uid} className="py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{request.characterName}</span>
              <NeedsConnection>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy !== null}
                  loading={busy === request.uid}
                  onClick={() => void decide(request, true)}
                >
                  {t('communities.requests.accept')}
                </Button>
              </NeedsConnection>
              <NeedsConnection>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void decide(request, false)}
                >
                  {t('communities.requests.decline')}
                </Button>
              </NeedsConnection>
            </div>
            {problem?.uid === request.uid && (
              <p role="alert" className="mt-1 text-danger">
                {problem.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
