import { useEffect } from 'react';
import { create } from 'zustand';

export const useDocumentTitleNameStore = create<{ name: string | null }>(() => ({ name: null }));

export function useDocumentTitleName(name: string | null | undefined): void {
  useEffect(() => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    useDocumentTitleNameStore.setState({ name: trimmed });
    return () => {
      if (useDocumentTitleNameStore.getState().name === trimmed) {
        useDocumentTitleNameStore.setState({ name: null });
      }
    };
  }, [name]);
}
