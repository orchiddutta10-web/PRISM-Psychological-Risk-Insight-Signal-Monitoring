import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  value: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  sm: { barW: 4, gap: 3, count: 20, height: 40 },
  md: { barW: 6, gap: 4, count: 20, height: 56 },
  lg: { barW: 8, gap: 5, count: 20, height: 72 },
};

const CONFIDENCE_LABELS: { min: number; label: string; color: string }[] = [
  { min: 80, label: 'High Confidence', color: Colors.accent[400] },
  { min: 50, label: 'Moderate Confidence', color: Colors.accent[500] },
  { min: 0, label: 'Developing Confidence', color: Colors.gray[500] },
];

function getConfidenceLabel(value: number) {
  return CONFIDENCE_LABELS.find(c => value >= c.min) || CONFIDENCE_LABELS[2];
}

export default function ConfidenceMeter({ value, size = 'md' }: Props) {
  const dims = SIZE_MAP[size];
  const clamped = Math.min(Math.max(value, 0), 100);
  const filledBars = Math.round((clamped / 100) * dims.count);
  const label = getConfidenceLabel(clamped);
  const animProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: filledBars / dims.count,
      duration: 800,
      delay: 200,
      useNativeDriver: false,
    }).start();
  }, [value]);

  return (
    <View style={styles.wrapper}>
      {/* Bar row */}
      <View style={styles.barRow}>
        {Array.from({ length: dims.count }).map((_, i) => {
          const barOpacity = animProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, i <= filledBars ? 1 : 0],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  width: dims.barW,
                  height: dims.height,
                  marginHorizontal: dims.gap / 2,
                  backgroundColor: i < filledBars ? label.color : 'rgba(255,255,255,0.08)',
                  opacity: i < filledBars ? barOpacity : 1,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Label + value */}
      <View style={styles.meta}>
        <Text style={[styles.label, { color: label.color }]}>{label.label}</Text>
        <Text style={[styles.value, { color: label.color }]}>{clamped}%</Text>
      </View>

      {/* Description */}
      <Text style={styles.description}>
        {clamped >= 80
          ? 'PRISM is confident in this insight based on consistent signal data over multiple days.'
          : clamped >= 50
          ? 'This insight is based on moderate evidence. More data will improve confidence.'
          : 'Confidence is developing. PRISM needs more behavioral data to strengthen this insight.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bar: {
    borderRadius: 2,
    minHeight: 4,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...Typography.h3,
    fontSize: 14,
  },
  value: {
    ...Typography.monoLarge,
    fontSize: 24,
    lineHeight: 28,
  },
  description: {
    ...Typography.bodySmall,
    lineHeight: 18,
    color: Colors.text.muted,
  },
});
