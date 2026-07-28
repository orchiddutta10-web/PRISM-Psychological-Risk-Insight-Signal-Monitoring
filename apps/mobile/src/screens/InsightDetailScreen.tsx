import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  Animated, TouchableOpacity,
} from 'react-native';
import { ArrowLeft, Brain, TrendingDown, ChevronRight } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import {
  AIReasoningPanel, ConfidenceMeter, BaselineComparisonCard,
  TrendGraph, RecommendationCard, BehaviorTimeline, createPeriod,
} from '../components';

interface Props {
  insightTitle: string;
  insightId: string;
  onBack: () => void;
  onViewDailyBrief?: () => void;
}

// Mock insight data — would come from API in production
const MOCK_INSIGHT = {
  title: 'Movement Lower Than Usual',
  summary: 'Your step count has dropped 18% below your 14-day personal average. This pattern was detected over the past 3 days.',
  confidence: 91,
  impact: 'minimal' as const,
  factors: [
    { signal: 'Activity', direction: 'down' as const, contribution: 'Step count decreased from 7,200 to 5,900 steps/day. Weather data suggests rainy conditions during this period, which likely contributed to reduced outdoor movement.' },
    { signal: 'Sleep', direction: 'stable' as const, contribution: 'Sleep duration remained consistent at ~6.5 hours. No significant change in bedtime or wake time was detected.' },
    { signal: 'Heart Rate', direction: 'stable' as const, contribution: 'Resting heart rate stayed within your personal range of 72-78 BPM. Recovery patterns appear normal.' },
    { signal: 'Screen Time', direction: 'up' as const, contribution: 'Screen time increased from 4.2h to 5.8h per day, consistent with more indoor activity during rainy weather.' },
  ],
  timeline: [
    createPeriod('08:15', 'Morning', 'morning', 'Morning walk was skipped. Movement 22% below typical morning baseline.', 'attention'),
    createPeriod('10:40', 'Morning', 'morning', 'Heart rate remained stable within personal range despite reduced movement.', 'normal'),
    createPeriod('13:10', 'Afternoon', 'afternoon', 'Lower movement persisted. Step accumulation is tracking 18% below average.', 'attention'),
    createPeriod('16:30', 'Afternoon', 'afternoon', 'Screen time began increasing — consistent with indoor activity pattern.', 'elevated'),
    createPeriod('20:00', 'Evening', 'evening', 'Physical activity remained below baseline. No evening walk detected.', 'attention'),
    createPeriod('22:45', 'Night', 'night', 'Late-night device usage increased. Bedtime was pushed ~40 minutes past baseline.', 'elevated'),
  ],
  trend: [
    { label: 'Mon', value: 85 },
    { label: 'Tue', value: 78 },
    { label: 'Wed', value: 72 },
    { label: 'Thu', value: 68 },
    { label: 'Fri', value: 71 },
    { label: 'Sat', value: 65 },
    { label: 'Sun', value: 62 },
  ],
};

export default function InsightDetailScreen({ insightTitle, onBack, onViewDailyBrief }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const insight = MOCK_INSIGHT;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Insight Detail</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: `${Colors.status.attention}15` }]}>
            <TrendingDown size={28} color={Colors.status.attention} />
          </View>
          <Text style={styles.heroTitle}>{insight.title}</Text>
          <Text style={styles.heroSummary}>{insight.summary}</Text>

          {/* Confidence */}
          <ConfidenceMeter value={insight.confidence} size="md" />
        </View>

        {/* AI Reasoning */}
        <View style={styles.section}>
          <AIReasoningPanel
            title="What happened?"
            summary="PRISM analyzed your behavioral signals and identified a temporary decrease in movement. This appears related to environmental factors rather than a lasting behavioral shift."
            factors={insight.factors}
            conclusion="The pattern is likely temporary. PRISM will continue monitoring and update you if the trend persists beyond the current weather pattern."
          />
        </View>

        {/* Baseline Comparison */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Baseline Comparison</Text>
          <BaselineComparisonCard
            metric="Daily Steps"
            userValue={5900}
            baselineValue={7200}
            unit="steps"
            trend="down"
          />
        </View>

        {/* Trend */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7-Day Movement Trend</Text>
          <View style={styles.trendCard}>
            <TrendGraph data={insight.trend} height={120} activeIndex={6} showLabels />
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <BehaviorTimeline periods={insight.timeline} />
        </View>

        {/* Recommendation */}
        <View style={styles.section}>
          <RecommendationCard
            title="Monitor over the next two days"
            description="Your reduced movement appears weather-related. If the pattern continues after conditions improve, PRISM will suggest a behavioral review. No action is needed right now."
            action="View Daily Brief"
            onPress={onViewDailyBrief}
          />
        </View>

        {/* Possible outcome */}
        <View style={styles.section}>
          <View style={styles.outcomeBox}>
            <Brain size={18} color={Colors.accent[300]} />
            <Text style={styles.outcomeTitle}>Likely Future Outcome</Text>
            <Text style={styles.outcomeText}>
              If conditions return to normal and movement recovers within 2 days, this pattern will be classified as a weather-related fluctuation rather than a behavioral change. PRISM will automatically update your insight score.
            </Text>
          </View>
        </View>

        <View style={{ height: Spacing.massive }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.h3,
    fontSize: 16,
  },
  scroll: {
    paddingTop: Spacing.xxl,
  },
  hero: {
    paddingHorizontal: Spacing.xxl,
    marginBottom: Spacing.xxxl,
    gap: Spacing.xl,
    alignItems: 'center',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...Typography.h1,
    fontSize: 24,
    textAlign: 'center',
    lineHeight: 30,
  },
  heroSummary: {
    ...Typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: Spacing.xxl,
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    ...Typography.label,
    fontSize: 11,
    marginBottom: Spacing.md,
  },
  trendCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  outcomeBox: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: `${Colors.accent[500]}20`,
    gap: Spacing.md,
    alignItems: 'center',
  },
  outcomeTitle: {
    ...Typography.h3,
    fontSize: 14,
  },
  outcomeText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
});
