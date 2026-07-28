import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import TrendGraph from './TrendGraph';
import BehaviorBadge from './BehaviorBadge';

interface Props {
  weekLabel: string;
  stability: number;
  trendData: Array<{ label: string; value: number }>;
  highlights: string[];
}

export default function WeeklySummaryCard({ weekLabel, stability, trendData, highlights }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <BarChart3 size={18} color={Colors.accent[300]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Weekly Summary</Text>
          <Text style={styles.subtitle}>{weekLabel}</Text>
        </View>
        <BehaviorBadge label={`${stability}% stable`} variant={stability > 70 ? 'baseline' : 'attention'} />
      </View>

      {/* Trend mini-graph */}
      <TrendGraph data={trendData} height={80} showLabels />

      {/* Highlights */}
      <View style={styles.highlights}>
        {highlights.map((h, i) => (
          <View key={i} style={styles.highlightRow}>
            <View style={styles.highlightDot} />
            <Text style={styles.highlightText}>{h}</Text>
          </View>
        ))}
      </View>
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
  header: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    ...Typography.h3,
    fontSize: 15,
    marginBottom: 2,
  },
  subtitle: {
    ...Typography.caption,
  },
  highlights: {
    gap: Spacing.sm,
  },
  highlightRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  highlightDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.accent[400],
    marginTop: 6,
  },
  highlightText: {
    ...Typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },
});
