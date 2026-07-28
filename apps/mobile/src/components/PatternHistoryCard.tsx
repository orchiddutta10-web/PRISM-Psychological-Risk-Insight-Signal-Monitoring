import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  title: string;
  date: string;
  stabilityScore: number;
  changes: Array<{ label: string; direction: 'up' | 'down' }>;
  onPress?: () => void;
}

export default function PatternHistoryCard({ title, date, stabilityScore, changes, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Calendar size={18} color={Colors.accent[300]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
        {onPress && <ChevronRight size={16} color={Colors.text.muted} />}
      </View>

      {/* Stability */}
      <View style={styles.stabilityRow}>
        <Text style={styles.stabilityLabel}>Behavioural Stability</Text>
        <View style={styles.stabilityBar}>
          <View style={[styles.stabilityFill, { width: `${stabilityScore}%` }]} />
        </View>
        <Text style={styles.stabilityValue}>{stabilityScore}%</Text>
      </View>

      {/* Changes */}
      <View style={styles.changesRow}>
        {changes.map((c, i) => (
          <View key={i} style={styles.changeChip}>
            {c.direction === 'up' ? (
              <TrendingUp size={12} color={Colors.status.attention} />
            ) : (
              <TrendingDown size={12} color={Colors.accent[400]} />
            )}
            <Text style={styles.changeLabel}>{c.label}</Text>
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
    width: 40,
    height: 40,
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
    fontSize: 14,
    marginBottom: 2,
  },
  date: {
    ...Typography.caption,
  },
  stabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stabilityLabel: {
    ...Typography.caption,
    width: 80,
  },
  stabilityBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  stabilityFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent[400],
  },
  stabilityValue: {
    ...Typography.monoSmall,
    width: 36,
    textAlign: 'right',
  },
  changesRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  changeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.full,
  },
  changeLabel: {
    ...Typography.caption,
    fontSize: 9,
  },
});
