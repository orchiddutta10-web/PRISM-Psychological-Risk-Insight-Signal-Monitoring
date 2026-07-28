import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated,
} from 'react-native';
import { ArrowLeft, BarChart3, Activity, Moon, Heart, Smartphone, Clock } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { BaselineComparisonCard, TrendGraph } from '../components';

interface Props {
  onBack: () => void;
}

const BASELINES = [
  { metric: 'Average Sleep', userValue: 6.7, baselineValue: 6.5, unit: 'hours', trend: 'stable' as const },
  { metric: 'Average Steps', userValue: 5900, baselineValue: 7200, unit: 'steps', trend: 'down' as const },
  { metric: 'Typical Heart Rate', userValue: 74, baselineValue: 76, unit: 'BPM', trend: 'stable' as const },
  { metric: 'Normal Screen Time', userValue: 5.8, baselineValue: 4.5, unit: 'hours', trend: 'up' as const },
];

const WEEKLY_DATA = [
  { label: 'Mon', value: 82 }, { label: 'Tue', value: 78 }, { label: 'Wed', value: 85 },
  { label: 'Thu', value: 80 }, { label: 'Fri', value: 76 }, { label: 'Sat', value: 72 },
  { label: 'Sun', value: 62 },
];

export default function PersonalBaselineScreen({ onBack }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Baseline</Text>
        <View style={{ width: 40 }} />
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Your Personal{'\n'}Baseline</Text>
          <Text style={styles.heroSubtitle}>
            PRISM compares you only against yourself — not population averages. Your baseline is built from 14 days of continuous behavioral data and updates automatically.
          </Text>
        </View>

        {/* Consistency Score */}
        <View style={styles.consistencyCard}>
          <View style={styles.consistencyHeader}>
            <BarChart3 size={20} color={Colors.accent[300]} />
            <View>
              <Text style={styles.consistencyLabel}>Weekly Consistency</Text>
              <Text style={styles.consistencyValue}>78%</Text>
            </View>
          </View>
          <View style={styles.consistencyBar}>
            <View style={[styles.consistencyFill, { width: '78%' }]} />
          </View>
        </View>

        {/* Baseline Comparisons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How You Compare</Text>
          {BASELINES.map((b, i) => (
            <View key={i} style={styles.comparisonWrapper}>
              <BaselineComparisonCard {...b} />
            </View>
          ))}
        </View>

        {/* Weekly trend */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Consistency Trend</Text>
          <View style={styles.trendCard}>
            <TrendGraph data={WEEKLY_DATA} height={110} activeIndex={6} showLabels />
          </View>
        </View>

        {/* Typical schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Typical Daily Pattern</Text>
          <View style={styles.scheduleCard}>
            {[
              { icon: <Moon size={14} color={Colors.accent[300]} />, label: 'Typical Bedtime', value: '11:00 PM' },
              { icon: <Clock size={14} color={Colors.accent[300]} />, label: 'Typical Wake Time', value: '7:15 AM' },
              { icon: <Activity size={14} color={Colors.accent[300]} />, label: 'Active Hours', value: '9 AM – 6 PM' },
              { icon: <Smartphone size={14} color={Colors.accent[300]} />, label: 'Peak Screen Time', value: '4 PM – 8 PM' },
            ].map((s, i) => (
              <View key={i} style={styles.scheduleRow}>
                <View style={styles.scheduleIcon}>{s.icon}</View>
                <Text style={styles.scheduleLabel}>{s.label}</Text>
                <Text style={styles.scheduleValue}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyText}>
            Your baseline is private and stored encrypted. It is never shared, sold, or used for any purpose other than powering your personal behavioral insights.
          </Text>
        </View>

        <View style={{ height: Spacing.massive }} />
      </Animated.ScrollView>
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
    paddingTop: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
  },
  hero: {
    marginBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  heroTitle: {
    ...Typography.h1,
  },
  heroSubtitle: {
    ...Typography.body,
    lineHeight: 22,
  },
  consistencyCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  consistencyHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  consistencyLabel: {
    ...Typography.label,
    fontSize: 10,
    marginBottom: 2,
  },
  consistencyValue: {
    ...Typography.monoLarge,
    fontSize: 28,
    lineHeight: 34,
    color: Colors.accent[300],
  },
  consistencyBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  consistencyFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent[400],
  },
  section: {
    marginBottom: Spacing.xxxl,
  },
  sectionTitle: {
    ...Typography.label,
    fontSize: 11,
    marginBottom: Spacing.md,
  },
  comparisonWrapper: {
    marginBottom: Spacing.md,
  },
  trendCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  scheduleCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.md,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  scheduleIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleLabel: {
    ...Typography.bodySmall,
    flex: 1,
  },
  scheduleValue: {
    ...Typography.monoSmall,
  },
  privacyNote: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  privacyText: {
    ...Typography.caption,
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    color: Colors.text.muted,
  },
});
