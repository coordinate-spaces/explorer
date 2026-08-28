// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { XyzDslEditor } from './XyzDslEditor';

const source = 'box first\nbox second';

afterEach(cleanup);

function ControlledEditor() {
  const [value, setValue] = useState(source);

  return <XyzDslEditor description="Edit declarations" value={value} onChange={setValue} />;
}

describe('XyzDslEditor', () => {
  it('preserves focus and the existing selection across an external selection-style update', () => {
    const { rerender } = render(
      <>
        <button type="button">Scene object</button>
        <XyzDslEditor description="Edit declarations" status="Object one" value={source} onChange={() => undefined} />
      </>,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const sceneObject = screen.getByRole('button', { name: 'Scene object' });

    textarea.focus();
    textarea.setSelectionRange(2, 7);
    sceneObject.focus();

    rerender(
      <>
        <button type="button">Scene object</button>
        <XyzDslEditor description="Edit declarations" status="Object two" value={source} onChange={() => undefined} />
      </>,
    );

    expect(document.activeElement).toBe(sceneObject);
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(7);
  });

  it('supports controlled typing without selecting a neighboring declaration', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange('box first'.length, 'box first'.length);
    await user.type(textarea, ' edited', { skipClick: true });

    expect(textarea.value).toBe('box first edited\nbox second');
    expect(textarea.selectionStart).toBe('box first edited'.length);
    expect(textarea.selectionEnd).toBe('box first edited'.length);
  });
});
