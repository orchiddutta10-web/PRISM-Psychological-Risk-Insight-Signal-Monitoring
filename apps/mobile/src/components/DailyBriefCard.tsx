import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import TrendGraph from './TrendGraph';

interface Props {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  summary: string;
  metrics: Array<{ label: string; value: string; trend: string }>;
  insight?: string;
}

const PERIOD_CONFIG = {
  morning: { label: 'Morning Summary', color: Colors.accent[400] },
  afternoon: { label: 'Afternoon Update', color: Colors.accent[300] },
  evening: { label: 'Evening Reflection', color: Colors.accent[500] },
  night: { label: 'End of Day', color: Colors.accent[600] },
};

export default function DailyBriefCard({ timeOfDay, summary, metrics, insight }: Props) {
  const config = PERIOD_CONFIG[timeOfDay];

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: config.color }]}>
      {/* Period label */}
      <Text style={[styles.period, { color: config.color }]}>{config.label}</Text>

      {/* Summary */}
      <Text style={styles.summary}>{summary}</Text>

      {/* Quick metrics */}
      <View style={styles.metrics}>
        {metrics.map((m, i) => (
          <View key={i} style={styles.metricRow}>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricTrend}>{m.trend}</Text>
          </View>
        ))}
      </View>

      {/* Additional insight */}
      {insight && (
        <Text style={styles.insight}>{insight}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.md,
  },
  period: {
    ...Typography.label,
    fontSize: 10,
  },
  summary: {
    ...Typography.body,
    lineHeight: 22,
  },
  metrics: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metricLabel: {
    ...Typography.caption,
    flex: 1,
  },
  metricValue: {
    ...Typography.monoSmall,
  },
  metricTrend: {
    ...Typography.monoSmall,
    color: Colors.accent[300],
    width: 40,
    textAlign: 'right',
  },
  insight: {
    ...Typography.bodySmall,
    fontStyle: 'italic',
    color: Colors.text.muted,
    lineHeight: 18,
  },
});
