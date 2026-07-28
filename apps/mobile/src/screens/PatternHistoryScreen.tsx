import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { PatternHistoryCard, TrendGraph } from '../components';

interface Props {
  onBack: () => void;
}

type Tab = 'today' | 'week' | 'month' | '90days';

const TABS: Tab[] = ['today', 'week', 'month', '90days'];

const TAB_DATA: Record<Tab, {
  stability: number;
  changes: Array<{ label: string; direction: 'up' | 'down' }>;
  trend: Array<{ label: string; value: number }>;
  highlights: string[];
}> = {
  today: {
    stability: 82,
    changes: [
      { label: 'Movement', direction: 'down' },
      { label: 'Screen time', direction: 'up' },
    ],
    trend: [
      { label: '6a', value: 65 }, { label: '9a', value: 72 }, { label: '12p', value: 58 },
      { label: '3p', value: 70 }, { label: '6p', value: 55 }, { label: '9p', value: 82 },
    ],
    highlights: [
      'Morning walk skipped — movement 22% below baseline',
      'Late-night screen time increased by 34%',
      'Heart rate remained stable throughout the day',
      'Sleep onset shifted ~40 minutes later than usual',
    ],
  },
  week: {
    stability: 76,
    changes: [
      { label: 'Movement', direction: 'down' },
      { label: 'Screen time', direction: 'up' },
      { label: 'Sleep', direction: 'down' },
    ],
    trend: [
      { label: 'Mon', value: 85 }, { label: 'Tue', value: 78 }, { label: 'Wed', value: 72 },
      { label: 'Thu', value: 68 }, { label: 'Fri', value: 71 }, { label: 'Sat', value: 65 },
      { label: 'Sun', value: 62 },
    ],
    highlights: [
      'Movement decreased 18% from weekly average',
      'Screen time increased 28% during rainy days',
      'Sleep consistency dropped on 2 nights',
      'Weekend routines showed greater variance',
    ],
  },
  month: {
    stability: 84,
    changes: [
      { label: 'Movement', direction: 'down' },
      { label: 'Sleep', direction: 'down' },
    ],
    trend: [
      { label: 'W1', value: 78 }, { label: 'W2', value: 82 }, { label: 'W3', value: 74 }, { label: 'W4', value: 62 },
    ],
    highlights: [
      'Overall stability score is 84% — well within normal range',
      'Movement dips correlate with rainy weather patterns',
      'Sleep consistency has improved compared to last month',
      'Screen time elevated during Week 4 (weather-related)',
    ],
  },
  '90days': {
    stability: 88,
    changes: [
      { label: 'Sleep', direction: 'up' },
      { label: 'Rhythm', direction: 'up' },
    ],
    trend: [
      { label: 'W-4', value: 72 }, { label: 'W-3', value: 78 }, { label: 'W-2', value: 82 }, { label: 'W-1', value: 62 },
    ],
    highlights: [
      'Long-term behavioral stability is 88% — above average',
      'Sleep consistency has improved 12% over 90 days',
      'Movement patterns are generally consistent',
      'Week 4 showed a temporary dip, now recovering',
    ],
  },
};

export default function PatternHistoryScreen({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('week');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const data = TAB_DATA[tab];

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pattern History</Text>
        <View style={{ width: 40 }} />
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Behavioral{'\n'}Pattern History</Text>
          <Text style={styles.heroSubtitle}>
            Track repeated patterns, improvements, and changes over time. PRISM compares you against your own history — not population norms.
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === '90days' ? '90 Days' : t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary Card */}
        <View style={styles.cardSection}>
          <PatternHistoryCard
            title="Behavior Stability"
            date={tab === 'today' ? 'Today' : tab === 'week' ? 'This Week' : tab === 'month' ? 'This Month' : 'Last 90 Days'}
            stabilityScore={data.stability}
            changes={data.changes}
          />
        </View>

        {/* Trend */}
        <View style={styles.cardSection}>
          <Text style={styles.sectionTitle}>Insight Score Trend</Text>
          <View style={styles.trendCard}>
            <TrendGraph data={data.trend} height={120} activeIndex={data.trend.length - 1} showLabels />
          </View>
        </View>

        {/* Highlights */}
        <View style={styles.cardSection}>
          <Text style={styles.sectionTitle}>Key Observations</Text>
          <View style={styles.highlightsCard}>
            {data.highlights.map((h, i) => (
              <View key={i} style={styles.highlightRow}>
                <View style={styles.highlightDot} />
                <Text style={styles.highlightText}>{h}</Text>
              </View>
            ))}
          </View>
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
    marginBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  heroTitle: {
    ...Typography.h1,
  },
  heroSubtitle: {
    ...Typography.body,
    lineHeight: 22,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.xxl,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  tabActive: {
    backgroundColor: Colors.surface.card,
  },
  tabText: {
    ...Typography.bodySmall,
    color: Colors.text.muted,
  },
  tabTextActive: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  cardSection: {
    marginBottom: Spacing.xl,
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
  highlightsCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.md,
  },
  highlightRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  highlightDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.accent[400],
    marginTop: 6,
  },
  highlightText: {
    ...Typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },
});
