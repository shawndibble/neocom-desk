import { useState } from 'react';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { MiningTaxPaymentMethod } from '@/db';
import { writeToClipboard } from '@/lib/clipboard';

export const SETTLE_FIELD_LABEL = eyebrowClassName;

export const SETTLE_METHODS: readonly MiningTaxPaymentMethod[] = ['donation', 'contract', 'other'];

/** Which row was last copied, for its "Copied" tick. */
export function useCopiedField() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(kind: string, text: string) {
    try {
      await writeToClipboard(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }
  return { copied, copy };
}
