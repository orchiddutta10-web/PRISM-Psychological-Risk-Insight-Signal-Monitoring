import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Animated, Alert,
} from 'react-native';
import { Heart, Activity, Bell, MapPin, Bluetooth, ChevronRight, Info } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import PermissionCard from '../components/PermissionCard';

interface Props {
  onComplete: () => void;
  onBack?: () => void;
}

interface PermState {
  health: boolean;
  activity: boolean;
  notifications: boolean;
  location: boolean;
  bluetooth: boolean;
}

export default function PermissionsScreen({ onComplete, onBack }: Props) {
  const [permissions, setPermissions] = useState<PermState>({
    health: false,
    activity: false,
    notifications: false,
    location: false,
    bluetooth: false,
  });
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const toggle = (key: keyof PermState) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Enable Permissions</Text>
          <Text style={styles.subtitle}>
            PRISM needs access to a few device capabilities to analyze behavioural patterns. Each permission improves insight quality.
          </Text>
        </View>

        {/* Permission cards */}
        <View style={styles.permsContainer}>
          <PermissionCard
            icon={<Heart size={20} color={Colors.accent[300]} />}
            title="Health Data"
            description="Heart rate and physiological baselines for detecting stress and recovery patterns."
            required
            value={permissions.health}
            onToggle={(v) => toggle('health')}
          />

          <PermissionCard
            icon={<Activity size={20} color={Colors.accent[300]} />}
            title="Activity & Motion"
            description="Step count and movement data to understand daily activity patterns and deviations."
            required
            value={permissions.activity}
            onToggle={(v) => toggle('activity')}
          />

          <PermissionCard
            icon={<Bell size={20} color={Colors.accent[300]} />}
            title="Notifications"
            description="Behavioural insight alerts and pattern-change notifications delivered quietly."
            value={permissions.notifications}
            onToggle={(v) => toggle('notifications')}
          />

          <PermissionCard
            icon={<MapPin size={20} color={Colors.accent[300]} />}
            title="Location (Optional)"
            description="Coarse location metadata for movement variance. No GPS coordinates are stored."
            value={permissions.location}
            onToggle={(v) => toggle('location')}
          />

          <PermissionCard
            icon={<Bluetooth size={20} color={Colors.accent[300]} />}
            title="Bluetooth (Optional)"
            description="Connect to PRISM Pulse wearable for real-time physiological signals."
            value={permissions.bluetooth}
            onToggle={(v) => toggle('bluetooth')}
          />
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Info size={16} color={Colors.text.muted} />
          <Text style={styles.infoText}>
            You can change these permissions anytime in Settings. Required permissions must be enabled for PRISM to function.
          </Text>
        </View>

        {/* Continue */}
        {permissions.health && permissions.activity ? (
          <TouchableOpacity style={styles.button} onPress={onComplete} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Continue to PRISM</Text>
            <ChevronRight size={20} color={Colors.white} />
          </TouchableOpacity>
        ) : (
          <View style={styles.buttonDimmed}>
            <Text style={styles.buttonTextDimmed}>Enable Required Permissions</Text>
          </View>
        )}
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
  title: {
    ...Typography.h1,
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    lineHeight: 24,
  },
  permsContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  infoBox: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    marginBottom: Spacing.xxl,
    alignItems: 'flex-start',
  },
  infoText: {
    ...Typography.bodySmall,
    flex: 1,
    lineHeight: 20,
    color: Colors.text.muted,
  },
  button: {
    backgroundColor: Colors.accent[500],
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  buttonText: {
    ...Typography.h3,
    color: Colors.white,
    fontSize: 16,
  },
  buttonDimmed: {
    backgroundColor: Colors.surface.elevated,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  buttonTextDimmed: {
    ...Typography.body,
    color: Colors.text.muted,
    fontWeight: '600',
  },
});
