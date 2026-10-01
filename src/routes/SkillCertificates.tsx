import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  EmptyState,
  FilterChip,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  Toast,
} from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import { CertificateRow } from '@/features/skills/certificates/CertificateRow';
import {
  certificateRows,
  certificateTimes,
  filterRows,
  gradeSummary,
  sortRows,
  type CertificateSort,
} from '@/features/skills/certificates/certificatesModel';
import { useCertificatesData } from '@/features/skills/certificates/useCertificatesData';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { targetPlanEntries, useTargetPlan } from '@/features/skills/useTargetPlan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { GrantNote } from '@/app/GrantNote';

const SORTS: readonly CertificateSort[] = ['grade', 'name', 'time'];
const TOAST_MS = 8000;
/** The group select's "every group" value — Radix Select reserves the empty string. */
const ALL_GROUPS = '__all__';

interface Added {
  planId: string;
  planName: string;
  entries: readonly PlanEntry[];
}

/**
 * Skills › Certificates (issue #2390): CCP's combat certificates graded
 * against the active Character, by area rather than by hull — the cross-hull
 * view ship masteries can't give. Each row shows its grade, what the next
 * grade still needs and how long that takes, and adds those levels to the
 * target Skill Plan.
 */
export function SkillCertificates() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const data = useCertificatesData(activeCharacterId);
  const target = useTargetPlan(activeCharacterId);
  const planEntries = useMemo(() => targetPlanEntries(target), [target]);

  const [group, setGroup] = useState<string | null>(null);
  const [hideElite, setHideElite] = useState(false);
  const [sort, setSort] = useState<CertificateSort>('grade');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [added, setAdded] = useState<Added | null>(null);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [added]);

  const { catalog, trainedSkills, attributes, implants, cloneState, skillsKnown } = data;
  const certificates = data.load.status === 'ready' ? data.load.certificates : null;
  const trainedLevel = useMemo(
    () => (id: number) => trainedSkills.get(id)?.level ?? 0,
    [trainedSkills]
  );
  const skillName = useMemo(
    () => (id: number) => catalog?.bySkillTypeID.get(id)?.name ?? `#${id}`,
    [catalog]
  );
  const alphaMaxLevel = useMemo(
    () =>
      cloneState === 'alpha' && catalog
        ? (id: number) => catalog.engineSkills.get(id)?.alphaMaxLevel ?? 0
        : undefined,
    [cloneState, catalog]
  );

  const rows = useMemo(
    () =>
      certificates && skillsKnown
        ? certificateRows(certificates, { trainedLevel, planEntries, alphaMaxLevel })
        : [],
    [certificates, skillsKnown, trainedLevel, planEntries, alphaMaxLevel]
  );

  const times = useMemo(
    () =>
      catalog
        ? certificateTimes(rows, {
            skills: catalog.engineSkills,
            trainedSkills,
            attributes,
            implants,
            cloneState,
          })
        : new Map(),
    [rows, catalog, trainedSkills, attributes, implants, cloneState]
  );

  const groupNames = useMemo(
    () => [...new Set((certificates ?? []).map((c) => c.groupName))],
    [certificates]
  );
  const visible = useMemo(
    () => sortRows(filterRows(rows, { group, hideElite }), sort, times),
    [rows, group, hideElite, sort, times]
  );
  const summary = useMemo(() => gradeSummary(rows), [rows]);

  async function add(entries: readonly PlanEntry[], certificateName: string) {
    const result = await target.addEntries(entries, certificateName);
    if (result.added.length > 0) {
      setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
    }
  }

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const loading = data.load.status === 'loading' || catalog === null;
  let body;
  if (data.load.status === 'failed') {
    body = (
      <EmptyState title={t('skills.certificates.loadFailed')} hint={t('common.loadFailedHint')} />
    );
  } else if (loading) {
    body = (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  } else if (!skillsKnown) {
    body = (
      <>
        {/* Only when the stored grant really lacks the skills read. */}
        <GrantNote
          endpoints={['getCharacterSkills']}
          title={t('skills.reauthTitle')}
          hint={t('skills.reauthHint')}
          actionLabel={t('skills.reauthAction')}
        />
        <EmptyState title={t('skills.emptyTitle')} hint={t('skills.emptyHint')} />
      </>
    );
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label={t('skills.certificates.summary.elite')} value={summary.elite} />
          <StatChip label={t('skills.certificates.summary.advanced')} value={summary.advanced} />
          <StatChip label={t('skills.certificates.summary.basicOnly')} value={summary.basicOnly} />
          <StatChip
            label={t('skills.certificates.summary.notStarted')}
            value={summary.notStarted}
          />
        </div>
        <div
          role="toolbar"
          aria-label={t('skills.certificates.filtersLabel')}
          className="flex flex-wrap items-center gap-2"
        >
          {/* A select rather than a chip per group: ten chips wrapped to five
              lines on a phone before the first certificate. */}
          <Select
            value={group ?? ALL_GROUPS}
            onValueChange={(next) => setGroup(next === ALL_GROUPS ? null : next)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t('skills.certificates.groupLabel')}
              className="w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROUPS}>{t('skills.certificates.allGroups')}</SelectItem>
              {groupNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FilterChip
            label={t('skills.certificates.hideElite')}
            selected={hideElite}
            onToggle={() => setHideElite(!hideElite)}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <TargetPlanPicker target={target} />
            <Select value={sort} onValueChange={(next) => setSort(next as CertificateSort)}>
              <SelectTrigger
                size="sm"
                aria-label={t('skills.certificates.sortLabel')}
                className="w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`skills.certificates.sort.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {visible.length === 0 ? (
          <EmptyState title={t('skills.certificates.noMatches')} />
        ) : (
          groupNames
            .filter((name) => visible.some((r) => r.certificate.groupName === name))
            .map((name) => {
              const inGroup = visible.filter((r) => r.certificate.groupName === name);
              const total = rows.filter((r) => r.certificate.groupName === name).length;
              return (
                <section key={name} className="border border-line bg-panel">
                  <h2 className="flex items-baseline justify-between px-3 pt-3 pb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {name}
                    <span className="font-normal tracking-normal normal-case tabular-nums">
                      {t('skills.certificates.groupCount', { shown: inGroup.length, total })}
                    </span>
                  </h2>
                  <ul>
                    {inGroup.map((row) => (
                      <CertificateRow
                        key={row.certificate.id}
                        row={row}
                        expanded={expandedId === row.certificate.id}
                        onToggle={() =>
                          setExpandedId((open) =>
                            open === row.certificate.id ? null : row.certificate.id
                          )
                        }
                        time={times.get(row.certificate.id)}
                        planEntries={planEntries}
                        trainedLevel={trainedLevel}
                        skillName={skillName}
                        onAdd={
                          target.plans === undefined
                            ? null
                            : () => void add(row.unplanned, row.certificate.name)
                        }
                      />
                    ))}
                  </ul>
                </section>
              );
            })
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('nav.skills')} />
      <SkillsSubNav />
      <p className="max-w-prose text-xs text-text-dim">{t('skills.certificates.intro')}</p>
      {body}
      {added && (
        <Toast
          message={t('skills.fitCheck.addedToast', {
            count: added.entries.length,
            plan: added.planName,
          })}
          undo={{
            label: t('skills.fitCheck.addedToastUndo'),
            onUndo: () => {
              void target.removeEntries(added.planId, added.entries);
              setAdded(null);
            },
          }}
        />
      )}
    </div>
  );
}
