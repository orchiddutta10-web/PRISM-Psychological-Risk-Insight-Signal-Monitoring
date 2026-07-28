import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Animated,
} from 'react-native';
import { Brain, Activity, Moon, Smartphone, TrendingUp } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  onContinue: () => void;
  onBack?: () => void;
}

const SIGNALS = [
  { icon: Activity, label: 'Activity', desc: 'Step count, movement entropy' },
  { icon: Moon, label: 'Sleep', desc: 'Rest duration, bedtime consistency' },
  { icon: Brain, label: 'Heart Rate', desc: 'Resting HR, variability trends' },
  { icon: Smartphone, label: 'Device Usage', desc: 'Screen time, typing dynamics' },
  { icon: TrendingUp, label: 'Behavioural Trends', desc: 'Pattern shifts over time' },
];

export default function BehaviorIntelligenceScreen({ onContinue, onBack }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.step}>Step 1 of 3</Text>
          <Text style={styles.title}>Behaviour Intelligence</Text>
          <Text style={styles.subtitle}>
            PRISM combines multiple signal sources to detect meaningful behavioural patterns — not just raw metrics, but how they relate to each other over time.
          </Text>
        </View>

        {/* Signal cards */}
        <View style={styles.signalsContainer}>
          {SIGNALS.map((signal, i) => (
            <View key={signal.label} style={styles.signalCard}>
              <View style={styles.signalIcon}>
                <signal.icon size={20} color={Colors.accent[300]} />
              </View>
              <View style={styles.signalText}>
                <Text style={styles.signalLabel}>{signal.label}</Text>
                <Text style={styles.signalDesc}>{signal.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Visual metaphor — floating signal waves */}
        <View style={styles.visualContainer}>
          {[0, 1, 2, 3, 4].map(i => (
            <View
              key={i}
              style={[
                styles.waveBar,
                {
                  height: 12 + Math.sin(i * 0.8) * 28 + 32,
                  backgroundColor: i === 2 ? Colors.accent[500] : Colors.accent[400],
                  opacity: 0.15 + i * 0.1,
                },
              ]}
            />
          ))}
        </View>

        {/* Continue */}
        <TouchableOpacity style={styles.button} onPress={onContinue} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.primary,
  },
  scroll: {
    padding: Spacing.xxl,
    paddingBottom: Spacing.massive,
  },
  header: {
    marginTop: Spacing.xxxl,
    marginBottom: Spacing.xxxl,
  },
  step: {
    ...Typography.label,
    color: Colors.accent[400],
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    marginBottom: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    lineHeight: 24,
  },
  signalsContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  signalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.md,
  },
  signalIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalText: {
    flex: 1,
  },
  signalLabel: {
    ...Typography.h3,
    fontSize: 14,
    marginBottom: 2,
  },
  signalDesc: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  visualContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
    height: 120,
    marginBottom: Spacing.xxxl,
  },
  waveBar: {
    width: 12,
    borderRadius: 6,
  },
  button: {
    backgroundColor: Colors.accent[500],
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    alignItems: 'center',
  },
  buttonText: {
    ...Typography.h3,
    color: Colors.white,
    fontSize: 16,
  },
});
