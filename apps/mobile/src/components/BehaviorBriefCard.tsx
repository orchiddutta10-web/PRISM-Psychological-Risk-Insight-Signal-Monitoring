import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme';
import ConfidenceMeter from './ConfidenceMeter';

interface Props {
  greeting: string;
  userName: string;
  headline: string;
  summary: string;
  observation: string;
  confidence: number;
  onPress?: () => void;
}

export default function BehaviorBriefCard({
  greeting, userName, headline, summary, observation, confidence, onPress,
}: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 18, stiffness: 140, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>
          {greeting}, <Text style={styles.name}>{userName}</Text>
        </Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* AI badge */}
      <View style={styles.aiBadge}>
        <Sparkles size={12} color={Colors.accent[300]} />
        <Text style={styles.aiBadgeText}>AI BRIEFING</Text>
      </View>

      {/* Headline */}
      <Text style={styles.headline}>{headline}</Text>

      {/* Summary */}
      <Text style={styles.summary}>{summary}</Text>

      {/* Observation */}
      <View style={styles.observationBox}>
        <View style={styles.observationDot} />
        <Text style={styles.observation}>{observation}</Text>
      </View>

      {/* Confidence */}
      <ConfidenceMeter value={confidence} size="sm" />

      {/* CTA */}
      {onPress && (
        <TouchableOpacity style={styles.cta} onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.ctaText}>View Full Analysis</Text>
          <ChevronRight size={16} color={Colors.accent[300]} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xxl,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: Spacing.xxl,
    gap: Spacing.lg,
    ...Shadows.lg,
  },
  greeting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingText: {
    ...Typography.h2,
    fontSize: 20,
  },
  name: {
    color: Colors.accent[300],
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: `${Colors.accent[500]}15`,
    borderRadius: Radius.full,
  },
  aiBadgeText: {
    ...Typography.label,
    color: Colors.accent[300],
    fontSize: 9,
  },
  headline: {
    ...Typography.h1,
    fontSize: 20,
    lineHeight: 26,
  },
  summary: {
    ...Typography.body,
    lineHeight: 22,
  },
  observationBox: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  observationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent[400],
    marginTop: 6,
  },
  observation: {
    ...Typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  ctaText: {
    ...Typography.body,
    color: Colors.accent[300],
    fontWeight: '600',
  },
});
