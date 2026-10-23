/**
 * `/corp/srp` for a member (issue #4852, epic #4608): file an SRP Claim by pasting a killmail link
 * or picking one of the pilot's lost ships, then follow My claims. Needs no Corp Access: the corp
 * comes from public affiliation and the rules from `getSrpStatus`. Laid out per the approved
 * mockups: desktop is one File a claim panel over My claims; a phone leads with the lost ships and
 * folds the paste form under them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Disclosure,
  EmptyState,
  LoadFailedState,
  PageHeader,
  Panel,
  Spinner,
  Toast,
} from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { useIsPhone } from '@/lib/useIsPhone';
import type { FileSrpClaimInput } from '../srpTypes';
import { ClaimDetailDialog, RefileDialog } from './MemberClaimDialogs';
import { MemberClaimsList } from './MemberClaimsList';
import { MemberFileForm, type FileFormErrors } from './MemberFileForm';
import { LostShipsList } from './LostShipsList';
import {
  esiKillmailLink,
  memberErrorKey,
  memberErrorTarget,
  type MemberClaim,
} from './srpMemberModel';
import { useMemberSrp, type LostRow, type MemberSrp as MemberData } from './useMemberSrp';

const KILLMAIL_ENDPOINTS = ['getCharacterKillmailsRecent'] as const;

interface MemberSrpProps {
  characterId: number;
  corporationId: number;
}

export function MemberSrp({ characterId, corporationId }: MemberSrpProps) {
  const { t } = useTranslation();
  const data = useMemberSrp(characterId, corporationId);
  const { status } = data;

  let body;
  if (status.state === 'loading') {
    body = (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  } else if (status.state === 'failed') {
    body = <LoadFailedState title={t('srpMember.loadFailed')} onRetry={data.retry} />;
  } else if (!status.value.enabled || !status.value.settings) {
    body = (
      <Panel>
        <EmptyState title={t('srpMember.notSetUp.title')} hint={t('srpMember.notSetUp.hint')} />
      </Panel>
    );
  } else {
    const { windowDays, requireFleetOrFc } = status.value.settings;
    body = (
      <MemberSrpBody
        characterId={characterId}
        data={data}
        windowDays={windowDays}
        fleetRequired={requireFleetOrFc}
      />
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t('srpMember.title')} />
      {body}
    </div>
  );
}

interface BodyProps {
  characterId: number;
  data: MemberData;
  windowDays: number;
  fleetRequired: boolean;
}

function MemberSrpBody({ characterId, data, windowDays, fleetRequired }: BodyProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [link, setLink] = useState('');
  const [fleet, setFleet] = useState('');
  const [errors, setErrors] = useState<FileFormErrors>({});
  const [listError, setListError] = useState<string | null>(null);
  const [filing, setFiling] = useState<number | 'form' | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberClaim | null>(null);
  const [refiling, setRefiling] = useState<{ claim: MemberClaim; error?: string } | null>(null);
  const [refileBusy, setRefileBusy] = useState(false);
  const fleetRef = useRef<HTMLInputElement>(null);
  const focusFleetRef = useRef(false);

  // The fleet field only exists once the paste disclosure has opened on a phone.
  useEffect(() => {
    if (!focusFleetRef.current || fleetRef.current === null) return;
    focusFleetRef.current = false;
    fleetRef.current.focus();
  });

  const claims = data.claims.state === 'ready' ? data.claims.value : [];
  const claimedHull = (typeId: number) => data.names.hull(typeId);

  const fileInput = useCallback(
    (killmail: string): FileSrpClaimInput => ({
      killmail,
      ...(fleet.trim() !== '' ? { fleetOrFc: fleet.trim() } : {}),
    }),
    [fleet]
  );

  async function submit(killmail: string, origin: 'form' | LostRow) {
    setFiling(origin === 'form' ? 'form' : origin.killmailId);
    setErrors({});
    setListError(null);
    try {
      await data.file(fileInput(killmail));
      setToast(
        origin === 'form'
          ? t('srpMember.file.filed')
          : t('srpMember.file.filedFor', { hull: origin.hullName })
      );
      setLink('');
    } catch (error) {
      const message = t(memberErrorKey(error));
      const target = memberErrorTarget(error);
      if (origin !== 'form') setListError(message);
      else if (target === 'link') setErrors({ link: message });
      else if (target === 'fleet') setErrors({ fleet: message });
      else if (target === 'notCovered') setErrors({ notCovered: true });
      else setErrors({ form: message });
    } finally {
      setFiling(null);
    }
  }

  function fileFromList(row: LostRow) {
    if (fleetRequired && fleet.trim() === '') {
      // The corp wants a Fleet or FC on every claim: fill the form in rather than file without one.
      setLink(esiKillmailLink(row.killmailId, row.killmailHash));
      setErrors({ fleet: t('srpMember.errors.fleetOrFcRequired') });
      setListError(null);
      setPasteOpen(true);
      focusFleetRef.current = true;
      return;
    }
    void submit(esiKillmailLink(row.killmailId, row.killmailHash), row);
  }

  async function refile(claim: MemberClaim, note: string) {
    setRefileBusy(true);
    try {
      await data.file({
        killmail: esiKillmailLink(claim.killmailId, claim.killmailHash),
        ...(claim.fleetOrFc ? { fleetOrFc: claim.fleetOrFc } : {}),
        note,
      });
      setRefiling(null);
      setToast(t('srpMember.file.filedFor', { hull: claimedHull(claim.hullTypeId) }));
    } catch (error) {
      setRefiling({ claim, error: t(memberErrorKey(error)) });
    } finally {
      setRefileBusy(false);
    }
  }

  const form = (
    <MemberFileForm
      link={link}
      onLink={setLink}
      fleet={fleet}
      onFleet={setFleet}
      fleetRef={fleetRef}
      fleetRequired={fleetRequired}
      windowDays={windowDays}
      errors={errors}
      busy={filing === 'form'}
      onSubmit={() => void submit(link.trim(), 'form')}
      fullWidth={phone}
    />
  );

  const lost = data.losses;
  const hasLostRows = lost.state === 'ready' && lost.value.length > 0;
  const lostList =
    lost.state === 'ready' && lost.value.length > 0 ? (
      <LostShipsList
        rows={lost.value}
        onFile={fileFromList}
        busyKillmailId={typeof filing === 'number' ? filing : null}
      />
    ) : null;
  const listErrorLine = listError ? (
    <p role="alert" className="px-3 py-2 text-sm text-danger">
      {listError}
    </p>
  ) : null;

  // The grant prompt, or what stands in for the list while it is not there to show.
  const lostNote =
    lost.state === 'denied' ? (
      <GrantBanner
        variant="ghost"
        characterId={characterId}
        endpoints={KILLMAIL_ENDPOINTS}
        title={t('srpMember.lost.grantTitle')}
        hint={t('srpMember.lost.grantHint')}
        actionLabel={t('srpMember.lost.grantAction')}
      />
    ) : lost.state === 'failed' ? (
      <LoadFailedState title={t('srpMember.lost.loadFailed')} onRetry={data.retry} />
    ) : lost.state === 'loading' ? (
      <Spinner />
    ) : lost.state === 'ready' && lost.value.length === 0 ? (
      <EmptyState title={t('srpMember.lost.empty.title')} hint={t('srpMember.lost.empty.hint')} />
    ) : null;

  const claimsPanel = (
    <Panel title={t('srpMember.claims.title')} padded={claims.length === 0}>
      {data.claims.state === 'failed' ? (
        <LoadFailedState onRetry={data.retry} />
      ) : data.claims.state === 'loading' ? (
        <Spinner />
      ) : claims.length > 0 ? (
        <MemberClaimsList
          claims={claims}
          hullName={data.names.hull}
          systemName={data.names.system}
          onOpen={setDetail}
          onRefile={(claim) => setRefiling({ claim })}
        />
      ) : (
        <EmptyState
          title={t('srpMember.claims.empty.title')}
          hint={t('srpMember.claims.empty.hint', { days: windowDays })}
        />
      )}
    </Panel>
  );

  return (
    <>
      {phone && hasLostRows ? (
        <>
          <Panel title={t('srpMember.lost.phoneTitle')} padded={false}>
            {listErrorLine}
            {lostList}
          </Panel>
          <Panel padded={false}>
            <Disclosure
              label={t('srpMember.file.pasteInstead')}
              expanded={pasteOpen}
              onToggle={() => setPasteOpen((open) => !open)}
            >
              <div className="p-3">{form}</div>
            </Disclosure>
          </Panel>
        </>
      ) : phone ? (
        <>
          {lostNote}
          <Panel title={t('srpMember.file.pasteTitle')}>{form}</Panel>
        </>
      ) : (
        <Panel title={t('srpMember.file.title')}>
          <div className="space-y-4">
            {form}
            <div className="space-y-2 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">{t('srpMember.lost.title')}</h3>
              {listErrorLine}
              {lostList}
              {lostNote}
            </div>
          </div>
        </Panel>
      )}
      {claimsPanel}
      {detail ? (
        <ClaimDetailDialog
          claim={detail}
          hullName={data.names.hull(detail.hullTypeId)}
          systemName={data.names.system(detail.solarSystemId)}
          onClose={() => setDetail(null)}
          onRefile={() => {
            setRefiling({ claim: detail });
            setDetail(null);
          }}
        />
      ) : null}
      {refiling ? (
        <RefileDialog
          claim={refiling.claim}
          hullName={claimedHull(refiling.claim.hullTypeId)}
          busy={refileBusy}
          error={refiling.error}
          onSubmit={(note) => void refile(refiling.claim, note)}
          onClose={() => setRefiling(null)}
        />
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
