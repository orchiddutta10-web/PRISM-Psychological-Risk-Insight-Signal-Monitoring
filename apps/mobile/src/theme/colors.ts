/**
 * PRISM Color Palette
 * Minimal, calm, premium — inspired by Apple Health, WHOOP, Headspace
 * Avoids fitness-app energy colors (neon green, aggressive orange)
 */

export const Colors = {
  // Core neutrals
  black: '#000000',
  white: '#FFFFFF',

  // Warm grays
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EBEBEB',
    300: '#D4D4D4',
    400: '#A8A8A8',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },

  // Accent — indigo/violet for intelligence, not energy
  accent: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },

  // Status — calm, non-alarmist
  status: {
    baseline: '#A5B4FC',   // Normal range — soft indigo
    attention: '#F59E0B',  // Mild deviation — amber
    elevated: '#F97316',   // Notable change — warm orange
    priority: '#6366F1',   // Needs review — deeper indigo
  },

  // Semantic
  surface: {
    primary: '#0A0A0A',
    secondary: '#171717',
    card: '#1C1C1C',
    elevated: '#262626',
    input: '#1A1A1A',
    overlay: 'rgba(0,0,0,0.6)',
  },

  // Text
  text: {
    primary: '#FFFFFF',
    secondary: '#A8A8A8',
    muted: '#737373',
    inverse: '#0A0A0A',
  },

  // Glass effect
  glass: {
    light: 'rgba(255,255,255,0.06)',
    medium: 'rgba(255,255,255,0.08)',
    strong: 'rgba(255,255,255,0.12)',
  },
} as const;

export type ColorKey = keyof typeof Colors;
