import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Brain, TrendingUp, TrendingDown, ChevronRight, Activity, Moon, Heart, Smartphone } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  title: string;
  description: string;
  confidence: number;
  impact: 'minimal' | 'moderate' | 'significant';
  factors: Array<{ signal: string; direction: 'up' | 'down' | 'stable'; value: string }>;
  onPress?: () => void;
}

const IMPACT_COLORS = {
  minimal: Colors.status.baseline,
  moderate: Colors.status.attention,
  significant: Colors.status.elevated,
};

const IMPACT_LABELS = {
  minimal: 'Minimal',
  moderate: 'Moderate',
  significant: 'Significant',
};

const SIGNAL_ICONS: Record<string, React.ReactNode> = {
  movement: <Activity size={14} color={Colors.accent[300]} />,
  activity: <Activity size={14} color={Colors.accent[300]} />,
  sleep: <Moon size={14} color={Colors.accent[300]} />,
  heart: <Heart size={14} color={Colors.accent[300]} />,
  screen: <Smartphone size={14} color={Colors.accent[300]} />,
  device: <Smartphone size={14} color={Colors.accent[300]} />,
};

export default function InsightExplanationCard({ title, description, confidence, impact, factors, onPress }: Props) {
  const impactColor = IMPACT_COLORS[impact];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: `${impactColor}15` }]}>
          <Brain size={18} color={impactColor} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.impactBadge, { backgroundColor: `${impactColor}18` }]}>
              <Text style={[styles.impactText, { color: impactColor }]}>
                {IMPACT_LABELS[impact]}
              </Text>
            </View>
            <Text style={styles.confidence}>{confidence}% confidence</Text>
          </View>
        </View>
        {onPress && <ChevronRight size={18} color={Colors.text.muted} />}
      </View>

      {/* Description */}
      <Text style={styles.description}>{description}</Text>

      {/* Contributing signals */}
      <View style={styles.signalsRow}>
        {factors.slice(0, 3).map((f, i) => (
          <View key={i} style={styles.signalChip}>
            {SIGNAL_ICONS[f.signal] || <Activity size={14} color={Colors.accent[300]} />}
            <Text style={styles.signalValue}>{f.value}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.md,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    ...Typography.h3,
    fontSize: 15,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  impactText: {
    ...Typography.badge,
    fontSize: 9,
  },
  confidence: {
    ...Typography.monoSmall,
    fontSize: 10,
  },
  description: {
    ...Typography.bodySmall,
    lineHeight: 20,
  },
  signalsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  signalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.full,
  },
  signalValue: {
    ...Typography.monoSmall,
    fontSize: 10,
  },
});
