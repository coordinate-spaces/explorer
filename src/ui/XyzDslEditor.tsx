import type { ChangeEvent, ReactNode } from 'react';

interface XyzDslEditorProps {
  value: string;
  description: string;
  status?: ReactNode;
  actions?: ReactNode;
  onChange: (value: string) => void;
}

export function XyzDslEditor({ value, description, status, actions, onChange }: XyzDslEditorProps) {
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <label className="xyzdsl-editor">
      <span className="xyzdsl-editor-heading">
        <span>Spatial declarations</span>
        {actions ? <span className="xyzdsl-editor-actions">{actions}</span> : null}
      </span>
      <small>{description}</small>
      {status ? <span className="xyzdsl-editor-status">{status}</span> : null}
      <textarea spellCheck={false} value={value} wrap="off" onChange={handleChange} />
    </label>
  );
}
