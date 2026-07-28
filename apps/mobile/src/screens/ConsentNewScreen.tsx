import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Animated,
} from 'react-native';
import { Check, Heart, Activity, Moon, Smartphone, Bell, Shield, ChevronRight, ExternalLink } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  onAccept: () => void;
  onViewPolicy?: () => void;
}

interface ConsentItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  accepted: boolean;
}

export default function ConsentScreen({ onAccept, onViewPolicy }: Props) {
  const [items, setItems] = useState<ConsentItem[]>([
    {
      key: 'health',
      icon: <Heart size={20} color={Colors.accent[300]} />,
      label: 'Health Data',
      description: 'Heart rate, heart rate variability, and physiological baselines for pattern detection.',
      accepted: false,
    },
    {
      key: 'activity',
      icon: <Activity size={20} color={Colors.accent[300]} />,
      label: 'Activity',
      description: 'Step count, movement entropy, and location variance for mobility analysis.',
      accepted: false,
    },
    {
      key: 'sleep',
      icon: <Moon size={20} color={Colors.accent[300]} />,
      label: 'Sleep',
      description: 'Bedtime consistency, sleep window estimation, and rest quality proxies.',
      accepted: false,
    },
    {
      key: 'device',
      icon: <Smartphone size={20} color={Colors.accent[300]} />,
      label: 'Device Usage',
      description: 'Screen time patterns, typing dynamics, and app usage metadata.',
      accepted: false,
    },
    {
      key: 'notifications',
      icon: <Bell size={20} color={Colors.accent[300]} />,
      label: 'Notifications',
      description: 'Receive behavioural insights and pattern-change alerts from PRISM.',
      accepted: false,
    },
  ]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const allAccepted = items.every(i => i.accepted);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const toggleItem = (key: string) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, accepted: !i.accepted } : i));
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
          <View style={styles.shieldBox}>
            <Shield size={32} color={Colors.accent[300]} />
          </View>
          <Text style={styles.title}>Your Data,{'\n'}Your Choice</Text>
          <Text style={styles.subtitle}>
            PRISM requires your permission to analyze behavioural signals. You control what's shared and can change these settings anytime.
          </Text>
        </View>

        {/* Consent checklist */}
        <View style={styles.checklist}>
          <Text style={styles.listTitle}>Signal Permissions</Text>
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.item, item.accepted && styles.itemActive]}
              onPress={() => toggleItem(item.key)}
              activeOpacity={0.7}
            >
              <View style={styles.itemLeft}>
                <View style={styles.itemIcon}>{item.icon}</View>
                <View style={styles.itemText}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                </View>
              </View>
              <View style={[styles.checkbox, item.accepted && styles.checkboxActive]}>
                {item.accepted ? <Check size={14} color={Colors.white} /> : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {allAccepted
              ? 'All signals enabled. AI insights will be comprehensive.'
              : `${items.filter(i => i.accepted).length} of ${items.length} signals enabled. Fewer signals may reduce insight accuracy.`}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, !allAccepted && styles.buttonDimmed]}
            onPress={allAccepted ? onAccept : undefined}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryButtonText, !allAccepted && styles.buttonTextDimmed]}>
              Accept & Continue
            </Text>
            <ChevronRight size={20} color={allAccepted ? Colors.white : Colors.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.policyButton} onPress={onViewPolicy} activeOpacity={0.7}>
            <ExternalLink size={16} color={Colors.text.muted} />
            <Text style={styles.policyText}>View Privacy Policy</Text>
          </TouchableOpacity>
        </View>
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
    alignItems: 'center',
    marginTop: Spacing.xxxl,
    marginBottom: Spacing.xxxl,
  },
  shieldBox: {
    width: 72,
    height: 72,
    borderRadius: Radius.xl,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  title: {
    ...Typography.h1,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    lineHeight: 24,
  },
  checklist: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  listTitle: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  itemActive: {
    borderColor: `${Colors.accent[500]}30`,
    backgroundColor: `${Colors.accent[500]}08`,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
  },
  itemLabel: {
    ...Typography.h3,
    fontSize: 14,
    marginBottom: 2,
  },
  itemDesc: {
    ...Typography.bodySmall,
    fontSize: 11,
    lineHeight: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.gray[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },
  checkboxActive: {
    backgroundColor: Colors.accent[500],
    borderColor: Colors.accent[500],
  },
  summary: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    marginBottom: Spacing.xxl,
  },
  summaryText: {
    ...Typography.bodySmall,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.accent[500],
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  buttonDimmed: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryButtonText: {
    ...Typography.h3,
    color: Colors.white,
    fontSize: 16,
  },
  buttonTextDimmed: {
    color: Colors.text.muted,
  },
  policyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  policyText: {
    ...Typography.bodySmall,
    color: Colors.text.muted,
  },
});
