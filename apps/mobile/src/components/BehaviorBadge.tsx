import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  label: string;
  variant?: 'baseline' | 'attention' | 'elevated' | 'priority';
}

const VARIANT_COLORS = {
  baseline: Colors.status.baseline,
  attention: Colors.status.attention,
  elevated: Colors.status.elevated,
  priority: Colors.status.priority,
};

const VARIANT_LABELS = {
  baseline: 'Baseline',
  attention: 'Attention',
  elevated: 'Elevated',
  priority: 'Priority',
};

export default function BehaviorBadge({ label, variant = 'baseline' }: Props) {
  const color = VARIANT_COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...Typography.badge,
    fontSize: 11,
  },
});
