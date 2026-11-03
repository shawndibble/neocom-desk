import { Pill } from '@/components/ui/Pill';

/** A mail's Custom Label names as quiet tags. Nothing renders when it has none, so a row never grows for them. */
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
