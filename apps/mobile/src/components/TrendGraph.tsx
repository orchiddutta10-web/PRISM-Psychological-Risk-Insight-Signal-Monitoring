import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

const BAR_W = 22;
const GAP = 6;

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  data: DataPoint[];
  height?: number;
  showLabels?: boolean;
  showValues?: boolean;
  activeIndex?: number;
  barColor?: string;
  activeColor?: string;
}

export default function TrendGraph({
  data,
  height = 100,
  showLabels = true,
  showValues = false,
  activeIndex,
  barColor = Colors.accent[600],
  activeColor = Colors.accent[400],
}: Props) {
  const animValues = useRef(data.map(() => new Animated.Value(0))).current;
  const maxVal = Math.max(...data.map(d => d.value));

  useEffect(() => {
    const animations = data.map((_, i) =>
      Animated.timing(animValues[i], {
        toValue: 1,
        duration: 500,
        delay: i * 60,
        useNativeDriver: false,
      })
    );
    Animated.stagger(50, animations).start();
  }, [data]);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.chartArea, { height }]}>
        {data.map((d, i) => {
          const barHeight = animValues[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, (d.value / maxVal) * (height - 20)],
          });
          const isActive = activeIndex === i;

          return (
            <View key={i} style={styles.barCol}>
              {showValues && (
                <Text style={[styles.barValue, isActive && styles.barValueActive]}>
                  {d.value}
                </Text>
              )}
              <Animated.View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: isActive ? (d.color || activeColor) : (d.color || barColor),
                    width: BAR_W,
                  },
                ]}
              />
              {showLabels && (
                <Text style={[styles.barLabel, isActive && styles.barLabelActive]}>
                  {d.label}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    gap: GAP,
  },
  barCol: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  barValue: {
    ...Typography.monoSmall,
    fontSize: 9,
  },
  barValueActive: {
    color: Colors.accent[300],
    fontWeight: '700',
  },
  bar: {
    borderRadius: 4,
  },
  barLabel: {
    ...Typography.caption,
    fontSize: 9,
  },
  barLabelActive: {
    color: Colors.accent[300],
    fontWeight: '700',
  },
});
