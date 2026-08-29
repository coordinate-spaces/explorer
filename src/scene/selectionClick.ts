export interface SelectionClickModifiers {
  metaKey: boolean;
  ctrlKey: boolean;
}

export function shouldSelectFromClick(selectionEnabled: boolean, event: SelectionClickModifiers): boolean {
  return selectionEnabled && (event.metaKey || event.ctrlKey);
}
