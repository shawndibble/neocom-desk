import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypeIcon } from './TypeIcon';

const BLUEPRINT_TYPE_ID = 681;
const SKIN_TYPE_ID = 34599;

/** jsdom never fires a real network request, so `onError` is driven by hand. */
function fail(img: HTMLImageElement) {
  fireEvent.error(img);
}

describe('TypeIcon', () => {
  it('requests the plain icon render first', () => {
    const { container } = render(<TypeIcon typeId={BLUEPRINT_TYPE_ID} size={32} />);
    const img = container.querySelector('img');
    expect(img?.src).toBe(`https://images.evetech.net/types/${BLUEPRINT_TYPE_ID}/icon?size=32`);
  });

  it('falls back to the blueprint render when the icon render 400s', () => {
    const { container } = render(<TypeIcon typeId={BLUEPRINT_TYPE_ID} size={32} />);
    fail(container.querySelector('img')!);
    const img = container.querySelector('img');
    expect(img?.src).toBe(`https://images.evetech.net/types/${BLUEPRINT_TYPE_ID}/bp?size=32`);
  });

  it('falls back to a placeholder glyph when neither render exists (SKINs)', () => {
    const { container } = render(
      <TypeIcon typeId={SKIN_TYPE_ID} size={32} className="h-4 w-4 shrink-0" />
    );
    fail(container.querySelector('img')!);
    fail(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    const placeholder = container.querySelector('span');
    expect(placeholder).toHaveClass('h-4', 'w-4', 'shrink-0');
    expect(placeholder?.querySelector('svg')).not.toBeNull();
  });

  it('sizes the placeholder from explicit width/height when no sizing className is given', () => {
    const { container } = render(
      <TypeIcon typeId={SKIN_TYPE_ID} size={32} width={64} height={64} />
    );
    fail(container.querySelector('img')!);
    fail(container.querySelector('img')!);

    const placeholder = container.querySelector('span');
    expect(placeholder).toHaveStyle({ width: '64px', height: '64px' });
  });

  it('resets the fallback stage when the typeId changes', () => {
    const { container, rerender } = render(<TypeIcon typeId={SKIN_TYPE_ID} size={32} />);
    fail(container.querySelector('img')!);
    fail(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    rerender(<TypeIcon typeId={BLUEPRINT_TYPE_ID} size={32} />);
    const img = container.querySelector('img');
    expect(img?.src).toBe(`https://images.evetech.net/types/${BLUEPRINT_TYPE_ID}/icon?size=32`);
  });

  it('lazy-loads, decodes off the main thread, and requests CORS so the service worker can cache it', () => {
    const { container } = render(<TypeIcon typeId={BLUEPRINT_TYPE_ID} size={32} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toHaveAttribute('crossorigin', 'anonymous');
  });

  it('goes straight to the blueprint render for a type whose bp render already loaded once', () => {
    const typeId = 688; // distinct id: the remembered set is module-level
    const first = render(<TypeIcon typeId={typeId} size={32} />);
    fail(first.container.querySelector('img')!);
    fireEvent.load(first.container.querySelector('img')!);
    first.unmount();

    const { container, rerender } = render(<TypeIcon typeId={SKIN_TYPE_ID} size={64} />);
    expect(container.querySelector('img')?.src).toContain(`/types/${SKIN_TYPE_ID}/icon`);
    rerender(<TypeIcon typeId={typeId} size={64} />);
    expect(container.querySelector('img')?.src).toBe(
      `https://images.evetech.net/types/${typeId}/bp?size=64`
    );

    const second = render(<TypeIcon typeId={typeId} size={32} />);
    expect(second.container.querySelector('img')?.src).toBe(
      `https://images.evetech.net/types/${typeId}/bp?size=32`
    );
  });

  it('does not remember a type whose icon failed but whose bp never loaded (e.g. a network blip)', () => {
    const typeId = 689;
    const first = render(<TypeIcon typeId={typeId} size={32} />);
    fail(first.container.querySelector('img')!);
    first.unmount();

    const second = render(<TypeIcon typeId={typeId} size={32} />);
    expect(second.container.querySelector('img')?.src).toContain(`/types/${typeId}/icon`);
  });
});
