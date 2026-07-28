import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  title: string;
  description: string;
  icon: React.ReactNode;
  confidence?: number; // 0-100
  timestamp?: string;
  onPress?: () => void;
  variant?: 'default' | 'attention' | 'elevated';
  style?: any;
}

export default function InsightCard({
  title,
  description,
  icon,
  confidence,
  timestamp,
  onPress,
  variant = 'default',
  style,
}: Props) {
  const accentColor = variant === 'attention'
    ? Colors.status.attention
    : variant === 'elevated'
    ? Colors.status.priority
    : Colors.status.baseline;

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <View style={[styles.iconBox, { backgroundColor: `${accentColor}15` }]}>
          {icon}
        </View>
      </View>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.description} numberOfLines={2}>{description}</Text>
      </View>

      <View style={styles.right}>
        {confidence !== undefined && (
          <View style={styles.confidenceRow}>
            <View style={[styles.confidenceDot, { backgroundColor: accentColor }]} />
            <Text style={[styles.confidenceText, { color: accentColor }]}>
              {confidence}%
            </Text>
          </View>
        )}
        {timestamp && (
          <Text style={styles.timestamp}>{timestamp}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  left: {
    flexShrink: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.h3,
    fontSize: 14,
    marginBottom: 2,
  },
  description: {
    ...Typography.bodySmall,
  },
  right: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    ...Typography.monoSmall,
    fontWeight: '700',
  },
  timestamp: {
    ...Typography.caption,
    fontSize: 10,
    marginTop: 2,
  },
});
