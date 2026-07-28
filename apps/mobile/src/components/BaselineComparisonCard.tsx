import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import AnimatedProgress from './AnimatedProgress';

interface Props {
  metric: string;
  userValue: number;
  baselineValue: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
}

export default function BaselineComparisonCard({ metric, userValue, baselineValue, unit, trend }: Props) {
  const maxVal = Math.max(userValue, baselineValue);
  const userPct = (userValue / maxVal) * 100;
  const basePct = (baselineValue / maxVal) * 100;
  const diff = userValue - baselineValue;
  const diffPct = baselineValue > 0 ? Math.round((diff / baselineValue) * 100) : 0;
  const isHigher = diff > 0;
  const diffColor = isHigher ? Colors.status.attention : Colors.accent[400];
  const diffLabel = isHigher ? `↑ ${diffPct}%` : `↓ ${Math.abs(diffPct)}%`;

  return (
    <View style={styles.card}>
      <Text style={styles.metric}>{metric}</Text>

      <View style={styles.bars}>
        {/* User value */}
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>You</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${userPct}%`, backgroundColor: Colors.accent[400] }]} />
          </View>
          <Text style={styles.barValue}>{userValue} {unit}</Text>
        </View>

        {/* Baseline */}
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>Baseline</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${basePct}%`, backgroundColor: Colors.gray[500] }]} />
          </View>
          <Text style={styles.barValue}>{baselineValue} {unit}</Text>
        </View>
      </View>

      {/* Delta */}
      <View style={[styles.deltaBadge, { backgroundColor: `${diffColor}15` }]}>
        <Text style={[styles.deltaText, { color: diffColor }]}>
          {diffLabel} vs your personal baseline
        </Text>
      </View>

      <Text style={styles.note}>
        PRISM compares you only against yourself — not population averages.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.lg,
  },
  metric: {
    ...Typography.h3,
    fontSize: 14,
  },
  bars: {
    gap: Spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barLabel: {
    ...Typography.caption,
    width: 50,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  barValue: {
    ...Typography.monoSmall,
    width: 60,
    textAlign: 'right',
  },
  deltaBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  deltaText: {
    ...Typography.monoSmall,
    fontSize: 10,
    fontWeight: '700',
  },
  note: {
    ...Typography.caption,
    fontSize: 10,
    lineHeight: 15,
    color: Colors.text.muted,
  },
});
