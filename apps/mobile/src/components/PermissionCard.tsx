import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  required?: boolean;
  value?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
}

export default function PermissionCard({
  icon, title, description, required = false,
  value, onToggle, onPress, disabled,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconBox}>
        {icon}
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {required && (
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>Required</Text>
            </View>
          )}
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>

      {onToggle && (
        <Switch
          value={value ?? false}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{ false: Colors.gray[700], true: Colors.accent[600] }}
          thumbColor={value ? Colors.accent[300] : Colors.gray[400]}
        />
      )}

      {onPress && !onToggle && (
        <TouchableOpacity onPress={onPress} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
  content: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  title: {
    ...Typography.h3,
    fontSize: 14,
  },
  requiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.status.attention + '20',
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.status.attention,
  },
  description: {
    ...Typography.bodySmall,
    fontSize: 12,
    lineHeight: 17,
  },
  skipButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  skipText: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
});
