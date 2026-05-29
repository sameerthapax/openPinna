export function getSelectedText() {
  return window.getSelection()?.toString().trim() ?? "";
}
