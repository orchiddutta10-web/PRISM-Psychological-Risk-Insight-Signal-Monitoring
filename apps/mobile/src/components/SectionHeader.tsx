import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function SectionHeader({ title, subtitle, action }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.textGroup}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {action && <View>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: Spacing.xxxl,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
  },
  textGroup: {
    flex: 1,
  },
  title: {
    ...Typography.h2,
    fontSize: 18,
    lineHeight: 24,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});
