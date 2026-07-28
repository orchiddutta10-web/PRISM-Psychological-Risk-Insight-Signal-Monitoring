import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  label: string;
  value: number; // 0-100
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const SIZE_MAP = {
  sm: { outer: 48, inner: 40, thickness: 4, font: 14 },
  md: { outer: 80, inner: 68, thickness: 6, font: 20 },
  lg: { outer: 120, inner: 102, thickness: 8, font: 28 },
};

export default function StatusIndicator({
  label,
  value,
  color = Colors.status.baseline,
  size = 'md',
  showLabel = true,
}: Props) {
  const dims = SIZE_MAP[size];
  const radius = (dims.inner - dims.thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value / 100, 0), 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.ring, { width: dims.outer, height: dims.outer }]}>
        {/* Background circle */}
        <View style={[styles.bgCircle, {
          width: dims.inner,
          height: dims.inner,
          borderRadius: dims.inner / 2,
          borderWidth: dims.thickness,
          borderColor: 'rgba(255,255,255,0.08)',
        }]} />

        {/* Progress circle — approximated with a colored border view */}
        <View style={[styles.progressOverlay, {
          width: dims.inner,
          height: dims.inner,
          borderRadius: dims.inner / 2,
          borderWidth: dims.thickness,
          borderColor: 'transparent',
          borderTopColor: color,
          borderRightColor: color,
          transform: [{ rotate: `${progress * 360 - 90}deg` }],
        }]} />

        <View style={[styles.valueBox, { width: dims.outer, height: dims.outer }]}>
          <Text style={[styles.valueText, { fontSize: dims.font, color: Colors.text.primary }]}>
            {Math.round(value)}
          </Text>
        </View>
      </View>
      {showLabel && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ring: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgCircle: {
    position: 'absolute',
  },
  progressOverlay: {
    position: 'absolute',
  },
  valueBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  label: {
    ...Typography.caption,
  },
});
