import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import type { Fitting } from '@/engine/fittings/types';
import { FittingModuleList } from './FittingModuleList';

const fitting = {
  modules: [{ slot: 'high', typeId: 100, chargeTypeId: 200 }],
  drones: [{ typeId: 300, quantity: 2 }],
  cargo: [{ typeId: 400, quantity: 5 }],
} as unknown as Fitting;

describe('FittingModuleList', () => {
  it('puts a type icon beside every module, charge, drone and cargo name', () => {
    const { container } = render(
      <FittingModuleList fitting={fitting} typeName={(id) => `Type ${id}`} />
    );
    expect(screen.getByText('Type 100')).toBeInTheDocument();
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    for (const id of [100, 200, 300, 400]) {
      expect(srcs.some((src) => src?.includes(`/${id}/`))).toBe(true);
    }
  });
});
