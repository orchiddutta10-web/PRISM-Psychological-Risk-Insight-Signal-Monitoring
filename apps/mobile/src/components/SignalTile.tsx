import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  label: string;
  icon: React.ReactNode;
  value: string | number;
  unit?: string;
  color?: string;
  size?: 'sm' | 'md';
}

export default function SignalTile({ label, icon, value, unit, color, size = 'md' }: Props) {
  const isMd = size === 'md';
  return (
    <View style={[styles.tile, isMd && styles.tileMd]}>
      <View style={[styles.iconBox, { backgroundColor: `${color || Colors.accent[400]}15` }]}>
        {icon}
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, isMd && styles.valueMd]}>{value}</Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flex: 1,
    minWidth: 80,
  },
  tileMd: {
    padding: Spacing.lg,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    ...Typography.caption,
    fontSize: 10,
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    ...Typography.mono,
    fontSize: 18,
    lineHeight: 24,
  },
  valueMd: {
    fontSize: 24,
    lineHeight: 30,
  },
  unit: {
    ...Typography.caption,
    fontSize: 10,
  },
});
