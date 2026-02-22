export type UiMode = 'legacy' | 'v2';

export const uiModeStorageKey = 'ptbizsms-ui-mode';

export const parseUiMode = (value: string | null | undefined): UiMode | null => {
  if (value === 'legacy' || value === 'v2') return value;
  return null;
};
