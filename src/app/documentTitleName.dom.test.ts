import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitleName, useDocumentTitleNameStore } from './documentTitleName';

describe('useDocumentTitleName', () => {
  it('leaves the name alone on unmount once another editor has set its own', () => {
    const leaving = renderHook(() => useDocumentTitleName('Old fit'));
    const arriving = renderHook(() => useDocumentTitleName('New plan'));
    leaving.unmount();
    expect(useDocumentTitleNameStore.getState().name).toBe('New plan');
    arriving.unmount();
    expect(useDocumentTitleNameStore.getState().name).toBeNull();
  });
});
