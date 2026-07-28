import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Sun, Sunset, Moon, Sunrise, Cloud } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Period {
  time: string;
  label: string;
  icon: React.ReactNode;
  observation: string;
  status: 'normal' | 'attention' | 'elevated';
}

interface Props {
  periods: Period[];
}

const STATUS_COLORS = {
  normal: Colors.status.baseline,
  attention: Colors.status.attention,
  elevated: Colors.status.elevated,
};

export default function BehaviorTimeline({ periods }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Behavior Timeline</Text>

      <View style={styles.timeline}>
        {periods.map((period, i) => {
          const isLast = i === periods.length - 1;
          return (
            <View key={period.time} style={styles.periodRow}>
              {/* Timeline line + dot */}
              <View style={styles.lineCol}>
                <View style={[styles.dot, { backgroundColor: STATUS_COLORS[period.status] }]} />
                {!isLast && <View style={styles.line} />}
              </View>

              {/* Content */}
              <View style={[styles.periodCard, isLast && styles.periodCardLast]}>
                <View style={styles.periodHeader}>
                  <View style={styles.timeRow}>
                    {period.icon}
                    <Text style={styles.time}>{period.time}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[period.status]}18` }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[period.status] }]}>
                      {period.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.observation}>{period.observation}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Pre-built periods for common use
const DEFAULT_PERIOD_ICONS: Record<string, React.ReactNode> = {
  morning: <Sunrise size={14} color={Colors.accent[300]} />,
  afternoon: <Sun size={14} color={Colors.accent[300]} />,
  evening: <Sunset size={14} color={Colors.accent[300]} />,
  night: <Moon size={14} color={Colors.accent[300]} />,
};

export function createPeriod(time: string, label: string, iconKey: string, observation: string, status: 'normal' | 'attention' | 'elevated'): Period {
  return {
    time,
    label,
    icon: DEFAULT_PERIOD_ICONS[iconKey] || <Cloud size={14} color={Colors.accent[300]} />,
    observation,
    status,
  };
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
  },
  title: {
    ...Typography.label,
    fontSize: 11,
    marginBottom: Spacing.sm,
  },
  timeline: {
    gap: 0,
  },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  lineCol: {
    alignItems: 'center',
    width: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 20,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 2,
  },
  periodCard: {
    flex: 1,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: Spacing.md,
  },
  periodCardLast: {
    marginBottom: 0,
  },
  periodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  time: {
    ...Typography.h3,
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusText: {
    ...Typography.badge,
    fontSize: 9,
  },
  observation: {
    ...Typography.bodySmall,
    lineHeight: 18,
  },
});
