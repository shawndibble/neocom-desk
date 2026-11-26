import { Pill } from '@/components/ui/Pill';

export function MailLabelTags({ names }: { names: readonly string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {names.map((name) => (
        <Pill key={name}>{name}</Pill>
      ))}
    </span>
  );
}
