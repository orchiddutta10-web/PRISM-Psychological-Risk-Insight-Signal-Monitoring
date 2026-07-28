import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Brain, CheckCircle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Factor {
  signal: string;
  direction: 'up' | 'down' | 'stable';
  contribution: string;
  icon?: React.ReactNode;
}

interface Props {
  title: string;
  summary: string;
  factors: Factor[];
  conclusion?: string;
}

export default function AIReasoningPanel({ title, summary, factors, conclusion }: Props) {
  return (
    <View style={styles.panel}>
      {/* Header */}
      <View style={styles.header}>
        <Brain size={18} color={Colors.accent[300]} />
        <Text style={styles.headerText}>AI Reasoning</Text>
      </View>

      {/* Summary */}
      <Text style={styles.summary}>{summary}</Text>

      {/* Title */}
      <Text style={styles.title}>{title}</Text>

      {/* Factors */}
      <View style={styles.factors}>
        {factors.map((f, i) => {
          const isUp = f.direction === 'up';
          const isDown = f.direction === 'down';
          const dirColor = isUp ? Colors.status.attention : isDown ? Colors.accent[400] : Colors.status.baseline;
          const DirIcon = isUp ? TrendingUp : isDown ? TrendingDown : CheckCircle;

          return (
            <View key={i} style={styles.factorRow}>
              <View style={[styles.factorIcon, { backgroundColor: `${dirColor}15` }]}>
                <DirIcon size={14} color={dirColor} />
              </View>
              <View style={styles.factorContent}>
                <Text style={styles.factorSignal}>{f.signal}</Text>
                <Text style={styles.factorContribution}>{f.contribution}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Conclusion */}
      {conclusion && (
        <View style={styles.conclusion}>
          <AlertCircle size={14} color={Colors.text.muted} />
          <Text style={styles.conclusionText}>{conclusion}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerText: {
    ...Typography.label,
    color: Colors.accent[300],
    fontSize: 10,
  },
  summary: {
    ...Typography.body,
    lineHeight: 22,
  },
  title: {
    ...Typography.h3,
    fontSize: 16,
  },
  factors: {
    gap: Spacing.md,
  },
  factorRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  factorIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factorContent: {
    flex: 1,
  },
  factorSignal: {
    ...Typography.h3,
    fontSize: 13,
    marginBottom: 2,
  },
  factorContribution: {
    ...Typography.bodySmall,
    lineHeight: 18,
  },
  conclusion: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    alignItems: 'flex-start',
  },
  conclusionText: {
    ...Typography.bodySmall,
    flex: 1,
    lineHeight: 18,
  },
});
