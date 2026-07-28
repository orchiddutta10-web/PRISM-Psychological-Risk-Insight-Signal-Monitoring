import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  Animated, TouchableOpacity,
} from 'react-native';
import { ArrowLeft, Sun, Coffee, Sunset, Moon } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import DailyBriefCard from '../components/DailyBriefCard';

interface Props {
  onBack: () => void;
}

const BRIEFS = [
  {
    timeOfDay: 'morning' as const,
    summary: 'You maintained a consistent morning routine. Sleep recovery was adequate, and heart rate is within your personal baseline. No significant overnight changes were detected.',
    metrics: [
      { label: 'Sleep', value: '6h 42m', trend: 'Stable' },
      { label: 'Resting HR', value: '74 BPM', trend: 'Normal' },
      { label: 'HRV', value: '48 ms', trend: '+3%' },
    ],
    insight: 'Your recovery metrics suggest you are well-rested. Today is a good day to maintain your usual activity level.',
  },
  {
    timeOfDay: 'afternoon' as const,
    summary: 'Movement tracking shows slightly lower than usual activity this morning. Late-morning screen time was higher than your typical weekday pattern. These appear connected to rainy weather in your area.',
    metrics: [
      { label: 'Steps', value: '2,100', trend: '↓ 18%' },
      { label: 'Screen Time', value: '2.4h', trend: '↑ 22%' },
      { label: 'Active Mins', value: '12 min', trend: '↓ 35%' },
    ],
    insight: 'The late-morning decrease appears weather-related and is likely temporary. No action is recommended.',
  },
  {
    timeOfDay: 'evening' as const,
    summary: 'Activity remained below your personal baseline throughout the afternoon. Screen time continued trending above your typical range. Heart rate patterns suggest a relaxed state rather than stress.',
    metrics: [
      { label: 'Steps', value: '4,800', trend: '↓ 20%' },
      { label: 'Screen Time', value: '4.9h', trend: '↑ 28%' },
      { label: 'Heart Rate', value: '76 BPM', trend: 'Stable' },
    ],
    insight: 'Your body is not showing stress signals — this is likely a rest day rather than a concerning pattern. A short evening walk could help balance your activity profile.',
  },
  {
    timeOfDay: 'night' as const,
    summary: 'Today you maintained a relaxed state throughout. Your reduced movement appears weather-related and temporary. Screen time was elevated, consistent with more indoor activity. No concerning behavioral patterns were detected.',
    metrics: [
      { label: 'Steps', value: '5,900', trend: '↓ 18%' },
      { label: 'Screen Time', value: '5.8h', trend: '↑ 34%' },
      { label: 'Sleep Window', value: '11:30 PM', trend: '~40m late' },
      { label: 'Stability', value: '76%', trend: 'Moderate' },
    ],
    insight: 'Overall, this was a low-movement, high-screen day — consistent with rain. PRISM will monitor tomorrow to see if movement returns to normal levels when conditions improve.',
  },
];

export default function DailyBriefScreen({ onBack }: Props) {
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
        <Text style={styles.headerTitle}>Daily Brief</Text>
        <View style={{ width: 40 }} />
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        <View style={styles.hero}>
          <Text style={styles.date}>Today</Text>
          <Text style={styles.heroTitle}>
            Your Daily{'\n'}Behavioural Brief
          </Text>
          <Text style={styles.heroSubtitle}>
            AI-generated summary of your behavioral patterns throughout the day. Updates automatically as new signals arrive.
          </Text>
        </View>

        {BRIEFS.map((brief, i) => (
          <View key={i} style={styles.briefSection}>
            <DailyBriefCard {...brief} />
          </View>
        ))}

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
  date: {
    ...Typography.label,
    color: Colors.accent[400],
  },
  heroTitle: {
    ...Typography.h1,
  },
  heroSubtitle: {
    ...Typography.body,
    lineHeight: 22,
  },
  briefSection: {
    marginBottom: Spacing.lg,
  },
});
