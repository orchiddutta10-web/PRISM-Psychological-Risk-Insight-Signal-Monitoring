import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Animated,
} from 'react-native';
import { Shield, Lock, Cpu, Server } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  onContinue: () => void;
  onBack?: () => void;
}

const FEATURES = [
  {
    icon: Shield,
    title: 'You own your data',
    description: 'All behavioural data belongs to you. You control what is collected and can pause or delete it anytime.',
  },
  {
    icon: Lock,
    title: 'End-to-end encrypted',
    description: 'Data is encrypted in transit and at rest. No raw content — only anonymized behavioural metadata.',
  },
  {
    icon: Cpu,
    title: 'AI runs responsibly',
    description: 'PRISM AI models operate locally where possible. When cloud processing is used, data is de-identified.',
  },
  {
    icon: Server,
    title: 'Never sold',
    description: 'Personal information is never sold, shared, or used for advertising. Privacy is non-negotiable.',
  },
];

export default function PrivacyScreen({ onContinue, onBack }: Props) {
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
        <View style={styles.header}>
          <Text style={styles.step}>Step 2 of 3</Text>
          <Text style={styles.title}>Privacy First</Text>
          <Text style={styles.subtitle}>
            PRISM is built on consent. Your privacy isn't a feature — it's the foundation.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={f.title} style={styles.card}>
              <View style={styles.iconBox}>
                <f.icon size={22} color={Colors.accent[300]} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{f.title}</Text>
                <Text style={styles.cardDesc}>{f.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Trust indicator */}
        <View style={styles.trustBox}>
          <Shield size={24} color={Colors.accent[300]} />
          <Text style={styles.trustText}>
            PRISM never captures message content, audio,{'\n'}
            video, or screenshots. Metadata only.
          </Text>
        </View>

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
  features: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    padding: Spacing.lg,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    ...Typography.h3,
    fontSize: 14,
    marginBottom: 2,
  },
  cardDesc: {
    ...Typography.bodySmall,
    fontSize: 12,
    lineHeight: 18,
  },
  trustBox: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  trustText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
    color: Colors.text.muted,
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
