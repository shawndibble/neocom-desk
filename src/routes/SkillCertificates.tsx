import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  CheckboxSelect,
  DataAgeBadge,
  EmptyState,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Toast,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PlanEntry } from '@/engine/types';
import { CertificateRow } from '@/features/skills/certificates/CertificateRow';
import {
  ALL_GRADES,
  certificateRows,
  certificateTimes,
  filterRows,
  gradeCounts,
  GRADES,
  sortRows,
  type CertificateGrade,
  type CertificateSort,
} from '@/features/skills/certificates/certificatesModel';
import { useCertificatesData } from '@/features/skills/certificates/useCertificatesData';
import { SkillsPageHeader } from '@/features/skills/SkillsPageHeader';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { targetPlanEntries, useTargetPlan } from '@/features/skills/useTargetPlan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { GrantNote } from '@/app/GrantNote';
import { useTimedToast } from '@/components/ui/useTimedToast';

const SORTS: readonly CertificateSort[] = ['grade', 'name', 'time'];
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
  const [grades, setGrades] = useState<ReadonlySet<CertificateGrade>>(ALL_GRADES);
  const [sort, setSort] = useState<CertificateSort>('grade');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [added, setAdded] = useState<Added | null>(null);
  useTimedToast(added, () => setAdded(null));

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
    () => sortRows(filterRows(rows, { group, grades }), sort, times),
    [rows, group, grades, sort, times]
  );
  const counts = useMemo(() => gradeCounts(rows), [rows]);

  function toggleGrade(grade: CertificateGrade) {
    setGrades((current) => {
      const next = new Set(current);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  }

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
        <div
          role="group"
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
              className="w-40"
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
          {/* Each grade carries its count, so the filter doubles as the summary. */}
          <CheckboxSelect
            label={t('skills.certificates.gradeFilter')}
            className="w-44"
            options={GRADES.map((grade) => ({
              value: grade,
              label: t('skills.certificates.gradeOption', {
                grade: t(`skills.certificates.grade.${grade}`),
                count: counts[grade],
              }),
            }))}
            selected={grades}
            onToggle={toggleGrade}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <TargetPlanPicker target={target} />
            <Select value={sort} onValueChange={(next) => setSort(next as CertificateSort)}>
              <SelectTrigger
                size="sm"
                aria-label={t('skills.certificates.sortLabel')}
                className="w-36"
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
      <SkillsPageHeader
        meta={data.fetchedAt && <DataAgeBadge date={data.fetchedAt} />}
        actions={
          <IconButton icon={<Icon.Refresh />} label={t('skills.refresh')} onClick={data.refresh} />
        }
      />
      <SkillsSubNav />
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
