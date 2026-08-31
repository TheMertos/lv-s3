import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * Logo-derived cyan scale (void → glow). Shade 6–7 are AA-safe fills; 4 is accent only.
 */
const lv: MantineColorsTuple = [
  '#cefafc',
  '#9ef4f8',
  '#5eeeff',
  '#1ee5ff',
  '#00e5ff',
  '#00c4d9',
  '#0080a8',
  '#007898',
  '#036881',
  '#035071',
];

/**
 * Mantine theme for the LV S3 admin console (storage/infrastructure tooling).
 */
export const appTheme = createTheme({
  primaryColor: 'lv',
  primaryShade: { light: 7, dark: 6 },
  colors: { lv },
  fontFamily: 'DM Sans, system-ui, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, ui-monospace, monospace',
  defaultRadius: 'md',
  headings: {
    fontFamily: 'DM Sans, system-ui, sans-serif',
    fontWeight: '600',
  },
});
