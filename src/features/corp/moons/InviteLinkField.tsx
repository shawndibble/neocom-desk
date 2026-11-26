import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextInput } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { Label } from './BookDialogs';

const k = (key: string) => `corpTaxBook.moons.moonOwners.dialogs.invite.${key}`;

export function InviteLinkField({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async () => {
    try {
      await writeToClipboard(url);
      setCopied(url);
    } catch {}
  };
  return (
    <div className="space-y-2">
      <Label text={t(k('link'))}>
        <TextInput readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </Label>
      <Button variant="ghost" onClick={() => void copy()}>
        {copied === url ? t(k('copied')) : t(k('copy'))}
      </Button>
    </div>
  );
}
