import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Lightbulb, ChevronRight } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  title: string;
  description: string;
  action?: string;
  onPress?: () => void;
}

export default function RecommendationCard({ title, description, action, onPress }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Lightbulb size={18} color={Colors.accent[300]} />
        </View>
        <View style={styles.content}>
          <Text style={styles.label}>RECOMMENDATION</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
      {onPress && action && (
        <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.actionText}>{action}</Text>
          <ChevronRight size={14} color={Colors.accent[300]} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: `${Colors.accent[500]}08`,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: `${Colors.accent[500]}20`,
    gap: Spacing.md,
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
    backgroundColor: `${Colors.accent[500]}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  label: {
    ...Typography.label,
    fontSize: 9,
    color: Colors.accent[300],
    marginBottom: 2,
  },
  title: {
    ...Typography.h3,
    fontSize: 14,
  },
  description: {
    ...Typography.bodySmall,
    lineHeight: 20,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  actionText: {
    ...Typography.bodySmall,
    color: Colors.accent[300],
    fontWeight: '600',
  },
});
