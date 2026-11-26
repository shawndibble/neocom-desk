import { useTranslation } from 'react-i18next';
import { Button, Eyebrow, TextInput } from '@/components/ui';
import { VETTING_ROLE_MAX } from '@/engine/vetting';
import { roleSuggestions } from './reviewRoster';

interface RoleFieldProps {
  value: string;
  onChange: (value: string) => void;
  corpTitles: readonly string[];
}

export function RoleField({ value, onChange, corpTitles }: RoleFieldProps) {
  const { t } = useTranslation();
  const { titles, roles } = roleSuggestions(value, corpTitles);
  const group = (label: string, list: string[]) =>
    list.length > 0 && (
      <div className="space-y-1">
        <Eyebrow>{label}</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {list.map((role) => (
            <Button key={role} size="sm" onClick={() => onChange(role)}>
              {role}
            </Button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('vetting.requestDialog.role')}</span>
        <TextInput
          className="w-full"
          value={value}
          maxLength={VETTING_ROLE_MAX}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('vetting.role.placeholder')}
          autoComplete="off"
        />
      </label>
      {group(t('vetting.role.titles'), titles)}
      {group(t('vetting.role.eveRoles'), roles)}
    </div>
  );
}
