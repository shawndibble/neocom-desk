import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { Field, Fields, FieldsHeading } from './Fields';
import { IskInput } from './IskInput';
import { TextInput } from './TextInput';
import { NativeSelect } from './NativeSelect';
import { TextArea } from './TextArea';

describe('Field note', () => {
  it('describes each control by the note', () => {
    render(
      <>
        <Field label="A" htmlFor="a" note="About a">
          <TextInput id="a" />
        </Field>
        <Field label="B" htmlFor="b" note="About b">
          <NativeSelect id="b">
            <option>x</option>
          </NativeSelect>
        </Field>
        <Field label="C" htmlFor="c" note="About c">
          <TextArea id="c" />
        </Field>
      </>
    );
    expect(screen.getByLabelText('A')).toHaveAccessibleDescription('About a');
    expect(screen.getByLabelText('B')).toHaveAccessibleDescription('About b');
    expect(screen.getByLabelText('C')).toHaveAccessibleDescription('About c');
  });

  it('keeps the caller ids first and adds no attribute without a note', () => {
    render(
      <>
        <span id="x">Extra</span>
        <Field label="A" htmlFor="a" note="About a">
          <TextInput id="a" aria-describedby="x" />
        </Field>
        <Field label="B" htmlFor="b">
          <TextInput id="b" />
        </Field>
      </>
    );
    expect(screen.getByLabelText('A')).toHaveAccessibleDescription('Extra About a');
    expect(screen.getByLabelText('B')).not.toHaveAttribute('aria-describedby');
  });

  it('describes an ISK field by its note', () => {
    render(
      <Field label="Price" htmlFor="p" note="Per unit">
        <IskInput id="p" value="" onChange={() => {}} />
      </Field>
    );
    const input = screen.getByLabelText('Price');
    expect(input).toHaveAccessibleDescription('Per unit');
  });
});

describe('FieldsHeading', () => {
  it('titles a group inside the one grid its Fields share', () => {
    const { container } = render(
      <Fields variant="form">
        <FieldsHeading>Pricing</FieldsHeading>
        <Field label="Hub" htmlFor="hub">
          <TextInput id="hub" />
        </Field>
        <FieldsHeading>Statements</FieldsHeading>
        <Field label="Grace" htmlFor="grace">
          <TextInput id="grace" />
        </Field>
      </Fields>
    );
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Pricing',
      'Statements',
    ]);
    // One grid: both groups' rows are its children, so they share the label column.
    expect(container.querySelectorAll(':scope > div > *')).toHaveLength(4);
  });
});
