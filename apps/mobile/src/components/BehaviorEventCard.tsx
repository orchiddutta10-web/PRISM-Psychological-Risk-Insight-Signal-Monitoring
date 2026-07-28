import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Clock, ChevronDown, Activity, Brain } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  time: string;
  event: string;
  confidence: number;
  signals: string[];
  reasoning: string;
}

export default function BehaviorEventCard({ time, event, confidence, signals, reasoning }: Props) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotateAnim, {
      toValue: expanded ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setExpanded(!expanded);
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <TouchableOpacity style={styles.card} onPress={toggle} activeOpacity={0.8}>
      {/* Collapsed view */}
      <View style={styles.row}>
        <View style={styles.timeBox}>
          <Clock size={12} color={Colors.accent[300]} />
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.event} numberOfLines={expanded ? undefined : 1}>{event}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={14} color={Colors.text.muted} />
        </Animated.View>
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expanded}>
          {/* Confidence */}
          <View style={styles.detailRow}>
            <Brain size={14} color={Colors.accent[300]} />
            <Text style={styles.detailText}>Confidence: {confidence}%</Text>
          </View>

          {/* Signals */}
          <View style={styles.detailRow}>
            <Activity size={14} color={Colors.accent[300]} />
            <View style={styles.signalChips}>
              {signals.map((s, i) => (
                <View key={i} style={styles.signalChip}>
                  <Text style={styles.signalChipText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Reasoning */}
          <Text style={styles.reasoning}>{reasoning}</Text>
        </View>
      )}
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 64,
  },
  time: {
    ...Typography.monoSmall,
    fontSize: 11,
    color: Colors.accent[300],
  },
  event: {
    ...Typography.body,
    flex: 1,
  },
  expanded: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    gap: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  detailText: {
    ...Typography.bodySmall,
  },
  signalChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  signalChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
  },
  signalChipText: {
    ...Typography.caption,
    fontSize: 9,
  },
  reasoning: {
    ...Typography.bodySmall,
    fontStyle: 'italic',
    color: Colors.text.muted,
    lineHeight: 18,
  },
});
