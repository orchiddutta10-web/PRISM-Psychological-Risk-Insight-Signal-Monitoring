import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  label: string;
  value: number; // 0-100
  color?: string;
  showValue?: boolean;
  height?: number;
}

export default function AnimatedProgress({
  label,
  value,
  color = Colors.accent[500],
  showValue = true,
  height = 4,
}: Props) {
  const pct = Math.min(Math.max(value, 0), 100);

  return (
    <View style={styles.wrapper}>
      {(label || showValue) && (
        <View style={styles.header}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showValue && <Text style={styles.value}>{pct}%</Text>}
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${pct}%`,
              backgroundColor: color,
              borderRadius: height / 2,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...Typography.caption,
  },
  value: {
    ...Typography.monoSmall,
    color: Colors.text.secondary,
  },
  track: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
