/**
 * PRISM Typography System
 * Premium, readable, calm — Inter for body, Space Grotesk for data
 */

import { StyleSheet, Platform } from 'react-native';
import { Colors } from './colors';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'System',
  default: 'System',
});

const monoFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const Typography = StyleSheet.create({
  // Display
  hero: {
    fontFamily,
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    lineHeight: 41,
    color: Colors.text.primary,
  },
  h1: {
    fontFamily,
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    lineHeight: 34,
    color: Colors.text.primary,
  },
  h2: {
    fontFamily,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    lineHeight: 28,
    color: Colors.text.primary,
  },
  h3: {
    fontFamily,
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.1,
    lineHeight: 24,
    color: Colors.text.primary,
  },

  // Body
  body: {
    fontFamily,
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: Colors.text.secondary,
  },
  bodySmall: {
    fontFamily,
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 19,
    color: Colors.text.secondary,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    color: Colors.text.muted,
  },

  // Mono (data, metrics)
  mono: {
    fontFamily: monoFamily,
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
    lineHeight: 22,
    color: Colors.text.primary,
  },
  monoLarge: {
    fontFamily: monoFamily,
    fontSize: 32,
    fontWeight: '700' as const,
    letterSpacing: -1,
    lineHeight: 38,
    color: Colors.text.primary,
  },
  monoSmall: {
    fontFamily: monoFamily,
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    color: Colors.text.muted,
  },

  // Labels
  label: {
    fontFamily,
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    lineHeight: 14,
    textTransform: 'uppercase' as const,
    color: Colors.text.muted,
  },
  badge: {
    fontFamily,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    lineHeight: 14,
  },
});
