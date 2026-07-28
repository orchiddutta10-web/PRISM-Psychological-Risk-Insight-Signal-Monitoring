import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Animated, SafeAreaView, StatusBar,
} from 'react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  onGetStarted: () => void;
  onLearnMore?: () => void;
}

export default function WelcomeScreen({ onGetStarted, onLearnMore }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const orbPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, damping: 15, stiffness: 120, useNativeDriver: true }),
    ]).start();

    // Orb pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1.08, duration: 2000, useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.surface.primary} />

      {/* Background elements */}
      <View style={styles.bgOrb1} />
      <View style={styles.bgOrb2} />

      <View style={styles.content}>
        {/* Animated PRISM logo orb */}
        <Animated.View style={[styles.logoOrb, { transform: [{ scale: orbPulse }] }]}>
          <View style={styles.logoInner}>
            <View style={styles.logoRing} />
            <View style={styles.logoDot} />
          </View>
          {/* Orb glow rings */}
          <View style={[styles.orbRing, { opacity: 0.15 }]} />
          <View style={[styles.orbRing, { width: 140, height: 140, top: -20, left: -20, opacity: 0.08 }]} />
        </Animated.View>

        {/* Text content */}
        <Animated.View style={[styles.textBlock, {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }]}>
          <Text style={styles.hero}>Understand your{'\n'}behaviour.</Text>
          <Text style={styles.subtitle}>
            PRISM continuously analyzes behavioural patterns{'\n'}
            using multiple data sources to help you understand{'\n'}
            changes before they become obvious.
          </Text>
        </Animated.View>

        {/* CTA buttons */}
        <Animated.View style={[styles.ctaBlock, {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }]}>
          <TouchableOpacity style={styles.primaryButton} onPress={onGetStarted} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onLearnMore} activeOpacity={0.7}>
            <Text style={styles.secondaryButtonText}>Learn More</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.primary,
  },
  bgOrb1: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: Colors.accent[600],
    opacity: 0.06,
  },
  bgOrb2: {
    position: 'absolute',
    bottom: -80,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.accent[400],
    opacity: 0.04,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.huge,
    paddingBottom: Spacing.huge,
  },
  // Logo
  logoOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xxxl,
  },
  logoInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  orbRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    top: -10,
    left: -10,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: Colors.accent[400],
  },
  // Text
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  hero: {
    ...Typography.hero,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    lineHeight: 24,
    color: Colors.text.secondary,
  },
  // CTA
  ctaBlock: {
    gap: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.accent[500],
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    alignItems: 'center',
    ...Shadows.glow(Colors.accent[500]),
  },
  primaryButtonText: {
    ...Typography.h3,
    color: Colors.white,
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryButtonText: {
    ...Typography.body,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
});
