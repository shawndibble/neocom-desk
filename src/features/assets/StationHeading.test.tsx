import { describe, it, expect, beforeEach } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { StationHeading } from './StationHeading';
import { PlaceName } from './PlaceName';
import { usePlaceNicknames, usePlaceNicknameMap } from './placeNicknames';

const STRUCTURE_ID = 1_040_000_000_001;
const REAL = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';

function Harness() {
  const nickname = usePlaceNicknameMap()[STRUCTURE_ID];
  return (
    <>
      <StationHeading
        locationId={STRUCTURE_ID}
        name={REAL}
        nickname={nickname}
        headingRef={createRef<HTMLHeadingElement>()}
        headingClassName="truncate"
      />
      <PlaceName locationId={STRUCTURE_ID} name={REAL} />
    </>
  );
}

beforeEach(async () => {
  await db.settings.clear();
  usePlaceNicknames.setState({ value: {}, hydrated: false });
});

describe('StationHeading', () => {
  it('shows the real name until a nickname is set, then both; clearing restores it', async () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: REAL })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: `Rename ${REAL}` }));
    const field = screen.getByRole('textbox', { name: 'Place nickname' });
    fireEvent.change(field, { target: { value: '  Home market  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(await screen.findByRole('heading', { name: 'Home market' })).toBeVisible();
    // The real name stays as the dim second line (heading line and PlaceName).
    expect(screen.getAllByText(REAL).length).toBeGreaterThan(0);
    await waitFor(async () =>
      expect((await db.settings.get('sync.placeNicknames'))?.value).toEqual({
        [STRUCTURE_ID]: 'Home market',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: `Rename ${REAL}` }));
    const again = screen.getByRole('textbox', { name: 'Place nickname' });
    fireEvent.change(again, { target: { value: '' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: REAL })).toBeVisible();
    expect(screen.queryByText('Home market')).not.toBeInTheDocument();
  });
});
