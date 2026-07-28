import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  onPress?: () => void;
  style?: any;
}

export default function MetricCard({ icon, label, value, unit, trend, trendValue, onPress, style }: Props) {
  const Container: any = onPress ? TouchableOpacity : View;

  const trendColor = trend === 'up'
    ? Colors.status.attention
    : trend === 'down'
    ? Colors.accent[400]
    : Colors.text.muted;

  return (
    <Container
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconBox}>
        {icon}
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
      {trendValue && (
        <View style={styles.trendRow}>
          <View style={[styles.trendDot, { backgroundColor: trendColor }]} />
          <Text style={[styles.trendText, { color: trendColor }]}>{trendValue}</Text>
        </View>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.caption,
    marginBottom: Spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  value: {
    ...Typography.monoLarge,
    fontSize: 28,
    lineHeight: 34,
  },
  unit: {
    ...Typography.caption,
    marginBottom: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  trendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trendText: {
    ...Typography.monoSmall,
  },
});
