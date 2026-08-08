import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Animated, RefreshControl,
} from 'react-native';
import {
  ChevronRight, Activity, Moon, Smartphone,
  Heart, ShieldCheck,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import {
  BehaviorBriefCard, BehaviorTimeline, createPeriod,
  InsightExplanationCard, WeeklySummaryCard,
  RecommendationCard,
} from '../components';
import { TokenManager } from '../services/api';
import InsightDetailScreen from './InsightDetailScreen';
import DailyBriefScreen from './DailyBriefScreen';
import PatternHistoryScreen from './PatternHistoryScreen';
import PersonalBaselineScreen from './PersonalBaselineScreen';
import GuardianDashboardScreen from './GuardianDashboardScreen';

type SubScreen = 'home' | 'insightDetail' | 'dailyBrief' | 'patternHistory' | 'personalBaseline' | 'guardian';

const USER_NAME = 'Alex';

// ── Timeline periods ─────────────────────────────────────────
const TIMELINE_PERIODS = [
  createPeriod('08:15', 'Morning', 'morning', 'Morning walk skipped. Movement 22% below typical morning baseline.', 'attention'),
  createPeriod('10:40', 'Morning', 'morning', 'Heart rate remained stable within personal range despite reduced movement.', 'normal'),
  createPeriod('13:10', 'Afternoon', 'afternoon', 'Lower movement persisted. Step accumulation tracking 18% below average.', 'attention'),
  createPeriod('16:30', 'Afternoon', 'afternoon', 'Focus duration increased. Screen time beginning to trend above normal.', 'elevated'),
  createPeriod('20:00', 'Evening', 'evening', 'Reduced physical activity continued. No evening walk detected.', 'attention'),
  createPeriod('22:45', 'Night', 'night', 'Late-night device usage increased. Bedtime pushed ~40 minutes past baseline.', 'elevated'),
];

// ── Weekly trend ─────────────────────────────────────────────
const WEEKLY_TREND = [
  { label: 'Mon', value: 82 }, { label: 'Tue', value: 78 }, { label: 'Wed', value: 85 },
  { label: 'Thu', value: 72 }, { label: 'Fri', value: 74 }, { label: 'Sat', value: 68 },
  { label: 'Sun', value: 64 },
];

export default function HomeScreen() {
  const [subScreen, setSubScreen] = useState<SubScreen>('home');
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string>('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    TokenManager.getToken().then(t => setToken(t || ''));
  }, []);

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 1200));
    setRefreshing(false);
  };

  // ── Sub-screen routing ──────────────────────────────────────
  if (subScreen === 'insightDetail') {
    return (
      <InsightDetailScreen
        insightTitle="Movement Lower Than Usual"
        insightId="insight-1"
        onBack={() => setSubScreen('home')}
        onViewDailyBrief={() => setSubScreen('dailyBrief')}
      />
    );
  }
  if (subScreen === 'dailyBrief') {
    return <DailyBriefScreen onBack={() => setSubScreen('home')} />;
  }
  if (subScreen === 'patternHistory') {
    return <PatternHistoryScreen onBack={() => setSubScreen('home')} />;
  }
  if (subScreen === 'personalBaseline') {
    return <PersonalBaselineScreen onBack={() => setSubScreen('home')} />;
  }
  if (subScreen === 'guardian') {
    return <GuardianDashboardScreen onBack={() => setSubScreen('home')} token={token} />;
  }

  // ── Main Home (AI Briefing) ─────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent[300]} />
        }
      >
        {/* ═══ AI BRIEFING CARD ═══ */}
        <BehaviorBriefCard
          greeting={getGreeting()}
          userName={USER_NAME}
          headline="Today's Behavioral Brief"
          summary="Your overall behavioral pattern is stable today. PRISM detected slightly lower movement than your personal baseline, but your sleep recovery remained consistent."
          observation="Late-night screen time is the primary driver of your elevated evening pattern. Consider a 15-minute wind-down without screens."
          confidence={94}
          onPress={() => setSubScreen('insightDetail')}
        />

        {/* ═══ BEHAVIOR TIMELINE ═══ */}
        <View style={styles.section}>
          <BehaviorTimeline periods={TIMELINE_PERIODS} />
        </View>

        {/* ═══ KEY INSIGHTS ═══ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Key Insights</Text>
          </View>
          <InsightExplanationCard
            title="Movement Lower Than Usual"
            description="18% below your weekly average. Likely related to rainy weather and increased desk time."
            confidence={91}
            impact="minimal"
            factors={[
              { signal: 'movement', direction: 'down', value: '↓ 18%' },
              { signal: 'screen', direction: 'up', value: '↑ 34%' },
              { signal: 'sleep', direction: 'down', value: 'Stable' },
            ]}
            onPress={() => setSubScreen('insightDetail')}
          />
        </View>

        {/* ═══ WEEKLY SUMMARY ═══ */}
        <View style={styles.section}>
          <WeeklySummaryCard
            weekLabel="June 24 – June 30, 2026"
            stability={76}
            trendData={WEEKLY_TREND}
            highlights={[
              'Movement decreased 18% from weekly average',
              'Screen time increased 28% during rainy days',
              'Sleep consistency dropped on 2 nights',
              'Weekend routines showed greater variance',
            ]}
          />
        </View>

        {/* ═══ RECOMMENDATION ═══ */}
        <View style={styles.section}>
          <RecommendationCard
            title="Take a short evening walk"
            description="A 15-minute walk after dinner could help offset today's reduced movement. No pressure — just an option if you feel like it."
            action="View Full Daily Brief"
            onPress={() => setSubScreen('dailyBrief')}
          />
        </View>

        {/* ═══ QUICK NAV CARDS ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Explore</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity
              style={styles.navCard}
              onPress={() => setSubScreen('personalBaseline')}
              activeOpacity={0.7}
            >
              <View style={[styles.navIcon, { backgroundColor: `${Colors.accent[400]}15` }]}>
                <Activity size={20} color={Colors.accent[300]} />
              </View>
              <Text style={styles.navLabel}>Your Baseline</Text>
              <Text style={styles.navDesc}>Personal averages & consistency</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navCard}
              onPress={() => setSubScreen('patternHistory')}
              activeOpacity={0.7}
            >
              <View style={[styles.navIcon, { backgroundColor: `${Colors.accent[500]}15` }]}>
                <Moon size={20} color={Colors.accent[300]} />
              </View>
              <Text style={styles.navLabel}>Pattern History</Text>
              <Text style={styles.navDesc}>Trends over time</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navCard}
              onPress={() => setSubScreen('dailyBrief')}
              activeOpacity={0.7}
            >
              <View style={[styles.navIcon, { backgroundColor: `${Colors.accent[300]}15` }]}>
                <Smartphone size={20} color={Colors.accent[300]} />
              </View>
              <Text style={styles.navLabel}>Daily Brief</Text>
              <Text style={styles.navDesc}>Full day breakdown</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navCard}
              onPress={() => setSubScreen('guardian')}
              activeOpacity={0.7}
            >
              <View style={[styles.navIcon, { backgroundColor: `${Colors.status.baseline}15` }]}>
                <ShieldCheck size={20} color={Colors.status.baseline} />
              </View>
              <Text style={styles.navLabel}>Guardian</Text>
              <Text style={styles.navDesc}>Monitor dependents</Text>
            </TouchableOpacity>
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
  scroll: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.massive,
  },
  section: {
    marginTop: Spacing.xxl,
    paddingHorizontal: Spacing.xxl,
  },
  sectionHeader: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.label,
    fontSize: 11,
    marginBottom: Spacing.md,
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  navCard: {
    width: '47%',
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.sm,
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  navLabel: {
    ...Typography.h3,
    fontSize: 13,
  },
  navDesc: {
    ...Typography.caption,
  },
});
